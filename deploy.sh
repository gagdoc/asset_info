#!/bin/bash

# ==============================================================================
# Google Cloud Run Deployment Script
# ==============================================================================

set -e

# Load configuration
CONFIG_FILE="deployment_config.json"
PROJECT_ID=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['project_id'])")
SERVICE_NAME=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['service_name'])")
REGION=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['region'])")
KEY_FILE=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE'))['service_account_key'])")

echo "🚀 Starting deployment for project: $PROJECT_ID ($SERVICE_NAME in $REGION)..."

# 1. Authenticate gcloud
echo "🔑 Authenticating with service account..."
gcloud auth activate-service-account --key-file="$KEY_FILE"
gcloud config set project "$PROJECT_ID"

# 2. Extract JSON key content for environment variable
JSON_CREDS=$(cat "$KEY_FILE")

# 3. Deploy to Cloud Run using --source (Direct Deployment)
echo "🚀 Building and Deploying directly to Google Cloud Run..."
# Using custom delimiter ^|^ to safely pass JSON string with commas/quotes
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars="^|^GOOGLE_CREDENTIALS_JSON=$JSON_CREDS"

echo "✅ Deployment successful!"
gcloud run services describe "$SERVICE_NAME" --platform managed --region "$REGION" --format 'value(status.url)'
