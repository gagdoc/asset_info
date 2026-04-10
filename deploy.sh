#!/bin/bash

# ==============================================================================
# Google Cloud Run Deployment Script (GitHub 최신 코드 기준 배포)
# ==============================================================================

set -e

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

# 4. Deploy to Cloud Run using --source (GitHub 최신 코드 기준)
echo "🚀 Building and Deploying directly to Google Cloud Run..."
# Using custom delimiter ^|^ to safely pass JSON string with commas/quotes
gcloud run deploy "$SERVICE_NAME" \
  --source "$DEPLOY_DIR" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars="^|^GOOGLE_CREDENTIALS_JSON=$JSON_CREDS"

# 5. 임시 디렉토리 정리
rm -rf "$DEPLOY_DIR"
echo "🧹 임시 파일 정리 완료"

echo "✅ Deployment successful!"
gcloud run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format 'value(status.url)'
