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
  local REPO="asia-northeast3-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/$SERVICE_NAME"
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

echo "🚀 Starting deployment for project: $PROJECT_ID ($SERVICE_NAME in $REGION)..."

# 1. Authenticate gcloud
echo "🔑 Authenticating with service account..."
gcloud auth activate-service-account --key-file="$KEY_FILE"
gcloud config set project "$PROJECT_ID"

# 2. Extract JSON key content for environment variable
JSON_CREDS=$(cat "$KEY_FILE")

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
  if gcloud run deploy "$SERVICE_NAME" \
    --source "$DEPLOY_DIR" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --set-env-vars="^|^APP_ENV=production|GOOGLE_CREDENTIALS_JSON=$JSON_CREDS"; then
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
gcloud run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format 'value(status.url)'

# 배포 성공 후 오래된 이미지 자동 정리 (Artifact Registry 비용 절감)
cleanup_old_images
