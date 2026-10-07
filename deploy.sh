#!/bin/bash

# ==============================================================================
# Google Cloud Run Deployment Script (GitHub 최신 코드 기준 배포)
# ==============================================================================

set -e

# ==============================================================================
# 오래된 Artifact Registry 이미지 자동 정리 함수 (비용 절감)
# 최신 3개 이미지만 유지하고 나머지를 삭제합니다.
# ==============================================================================
cleanup_old_images() {
  local REPO="asia-northeast3-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/$DEPLOY_SERVICE_NAME"
  echo "🧹 오래된 Artifact Registry 이미지 정리 중..."
  echo "   (최신 3개만 유지, 나머지 삭제)"

  # 최신 3개를 제외한 이미지 digest 목록 추출 (메인 이미지만, 레이어 제외)
  local DIGESTS_TO_DELETE
  DIGESTS_TO_DELETE=$(gcloud artifacts docker images list "$REPO" \
    --sort-by="~CREATE_TIME" \
    --format="value(version)" \
    --filter="tags:latest OR tags:'' " 2>/dev/null | tail -n +4)

  if [ -z "$DIGESTS_TO_DELETE" ]; then
    echo "   ✅ 정리할 이미지가 없습니다."
    return 0
  fi

  local DELETED_COUNT=0
  while IFS= read -r DIGEST; do
    if [ -n "$DIGEST" ]; then
      gcloud artifacts docker images delete "$REPO@$DIGEST" \
        --delete-tags --quiet 2>/dev/null && DELETED_COUNT=$((DELETED_COUNT + 1)) || true
    fi
  done <<< "$DIGESTS_TO_DELETE"

  echo "   ✅ 이미지 정리 완료: ${DELETED_COUNT}개 삭제됨"
}

# Load configuration
CONFIG_FILE="deployment_config.json"
PROJECT_ID=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['project_id'])")
SERVICE_NAME=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['service_name'])")
REGION=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['region'])")
KEY_FILE=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['service_account_key'])")
GITHUB_REPO=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('github_repo', 'https://github.com/gagdoc/asset_info'))")

# ── 환경 지정 검증 ──────────────────────────────────────────────────
TARGET_ENV=$1
if [ "$TARGET_ENV" != "prod" ] && [ "$TARGET_ENV" != "test" ]; then
  echo "❌ 오류: 배포 환경을 지정해야 합니다."
  echo "사용법: ./deploy.sh [prod|test]"
  echo "  - prod: 실제 운영 서버 ($SERVICE_NAME)에 배포"
  echo "  - test: 테스트 서버 ($SERVICE_NAME-test)에 배포"
  exit 1
fi

# ── 테스트 환경 배포 시 구글 시트 ID 검증 및 설정 ─────────────────────
if [ "$TARGET_ENV" = "test" ]; then
  ENV_FILE=".env.development"
  if [ ! -f "$ENV_FILE" ]; then
    echo "❌ 오류: 로컬에 $ENV_FILE 파일이 존재하지 않습니다."
    echo "먼저 scripts/create_test_sheets.py 를 실행하거나 해당 파일을 작성하세요."
    exit 1
  fi
  
  # .env.development에서 값 파싱
  TEST_SPREADSHEET_ID=$(grep -E "^TEST_SPREADSHEET_ID=" "$ENV_FILE" | cut -d'=' -f2-)
  TEST_CONSUMABLES_MASTER_ID=$(grep -E "^TEST_CONSUMABLES_MASTER_ID=" "$ENV_FILE" | cut -d'=' -f2-)
  TEST_CONSUMABLES_OUTBOUND_ID=$(grep -E "^TEST_CONSUMABLES_OUTBOUND_ID=" "$ENV_FILE" | cut -d'=' -f2-)
  TEST_TONER_ID=$(grep -E "^TEST_TONER_ID=" "$ENV_FILE" | cut -d'=' -f2-)
  
  if [ -z "$TEST_SPREADSHEET_ID" ] || [ -z "$TEST_CONSUMABLES_MASTER_ID" ] || [ -z "$TEST_CONSUMABLES_OUTBOUND_ID" ] || [ -z "$TEST_TONER_ID" ]; then
    echo "❌ 오류: $ENV_FILE 파일에 일부 TEST_ 시트 ID가 비어있습니다."
    echo "모든 ID 값이 채워져 있어야 테스트 서버 배포가 가능합니다."
    exit 1
  fi
fi

# ── 배포 대상 변수 설정 ─────────────────────────────────────────────
TEST_SERVICE_NAME=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('test_service_name', 'asset-info-test'))" 2>/dev/null || echo "asset-info-test")

if [ "$TARGET_ENV" = "prod" ]; then
  DEPLOY_SERVICE_NAME="$SERVICE_NAME"
  DEPLOY_APP_ENV="production"
else
  DEPLOY_SERVICE_NAME="$TEST_SERVICE_NAME"
  DEPLOY_APP_ENV="staging"
fi

echo "🚀 Starting deployment for project: $PROJECT_ID ($DEPLOY_SERVICE_NAME as $TARGET_ENV environment in $REGION)..."

# 1. Authenticate gcloud
echo "🔑 Authenticating with service account..."
gcloud auth activate-service-account --key-file="$KEY_FILE"
gcloud config set project "$PROJECT_ID"

# 2. Extract JSON key content for environment variable
JSON_CREDS=$(cat "$KEY_FILE")

# ── 환경 변수 문자열 빌드 ───────────────────────────────────────────
if [ "$TARGET_ENV" = "prod" ]; then
  ENV_VARS="^|^APP_ENV=production|GOOGLE_CREDENTIALS_JSON=$JSON_CREDS"
else
  ENV_VARS="^|^APP_ENV=staging|GOOGLE_CREDENTIALS_JSON=$JSON_CREDS|TEST_SPREADSHEET_ID=$TEST_SPREADSHEET_ID|TEST_CONSUMABLES_MASTER_ID=$TEST_CONSUMABLES_MASTER_ID|TEST_CONSUMABLES_OUTBOUND_ID=$TEST_CONSUMABLES_OUTBOUND_ID|TEST_TONER_ID=$TEST_TONER_ID"
fi

# 3. GitHub에서 최신 코드를 임시 디렉토리에 클론
echo "📥 GitHub에서 최신 코드를 가져오는 중..."
DEPLOY_DIR=$(mktemp -d)
git clone --depth=1 "$GITHUB_REPO" "$DEPLOY_DIR"
echo "✅ 클론 완료: $DEPLOY_DIR"

# 4. Deploy to Cloud Run using --source (GitHub 최신 코드 기준, 충돌 시 재시도)
echo "🚀 Building and Deploying directly to Google Cloud Run..."

MAX_RETRIES=3
RETRY_DELAY=15
SUCCESS=false

for i in $(seq 1 $MAX_RETRIES); do
  echo "🔄 배포 시도 $i/$MAX_RETRIES..."
  if gcloud run deploy "$DEPLOY_SERVICE_NAME" \
    --source "$DEPLOY_DIR" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --set-env-vars="$ENV_VARS"; then
    SUCCESS=true
    break
  else
    if [ $i -lt $MAX_RETRIES ]; then
      echo "⚠️  배포 실패. ${RETRY_DELAY}초 후 재시도..."
      sleep $RETRY_DELAY
    fi
  fi
done

# 5. 임시 디렉토리 정리
rm -rf "$DEPLOY_DIR"
echo "🧹 임시 파일 정리 완료"

if [ "$SUCCESS" = false ]; then
  echo "❌ 배포 실패 ($MAX_RETRIES회 시도). Cloud Build 로그를 확인하세요."
  exit 1
fi

echo "✅ Deployment successful!"
gcloud run services describe "$DEPLOY_SERVICE_NAME" --platform managed --region "$REGION" --format 'value(status.url)'

# 배포 성공 후 오래된 이미지 자동 정리 (Artifact Registry 비용 절감)
cleanup_old_images
