#!/usr/bin/env bash
# Deploy only the isolated test branch after it has been pushed to GitHub.
set -euo pipefail
if [[ "${1:-}" != "test" ]]; then
  echo 'Usage: ./deploy.sh test [runtime-env.json]. This checkout cannot deploy production.' >&2
  exit 2
fi
ROOT=$(cd "$(dirname "$0")" && pwd)
ENV_FILE=${2:-"$ROOT/../runtime-env.json"}
cd "$ROOT"
BRANCH=$(git branch --show-current)
[[ "$BRANCH" == codex/isolated-test-* ]] || { echo 'A dedicated test branch is required.' >&2; exit 2; }
git diff --quiet && git diff --cached --quiet || { echo 'Commit test source changes first.' >&2; exit 2; }
COMMIT=$(git rev-parse HEAD)
REPOSITORY=$(git remote get-url origin)
DEPLOY_DIR=$(mktemp -d)
ENV_VARS_FILE=$(mktemp)
chmod 600 "$ENV_VARS_FILE"
trap 'rm -rf "$DEPLOY_DIR"; rm -f "$ENV_VARS_FILE"' EXIT
python3 - "$ENV_FILE" "$ENV_VARS_FILE" <<'PY'
import json,sys,os
from pathlib import Path
values=json.loads(Path(sys.argv[1]).read_text())
if values.get('APP_ENV')!='staging': raise SystemExit('Only staging is allowed')
os.environ.update(values)
import config
if not config.IS_STAGING: raise SystemExit('Staging config required')
if len(values.get('STAGING_ACCESS_PASSWORD',''))<16: raise SystemExit('Test password required')
key=values.pop('GOOGLE_CREDENTIALS_FILE')
values['GOOGLE_CREDENTIALS_JSON']=Path(key).read_text()
Path(sys.argv[2]).write_text(json.dumps(values))
PY
git clone --quiet --single-branch --branch "$BRANCH" "$REPOSITORY" "$DEPLOY_DIR"
[[ "$(git -C "$DEPLOY_DIR" rev-parse HEAD)" == "$COMMIT" ]] || { echo 'Push this exact commit before deployment.' >&2; exit 2; }
echo "Deploying test commit $COMMIT to asset-info-test"
gcloud run deploy asset-info-test \
  --project=st-asset-project --region=asia-northeast3 \
  --source="$DEPLOY_DIR" --platform=managed \
  --allow-unauthenticated --env-vars-file="$ENV_VARS_FILE" \
  --memory=512Mi --cpu=1 --concurrency=1 --min-instances=0 --max-instances=1 \
  --labels=environment=staging --quiet
# No production service or Artifact Registry cleanup is performed.
gcloud run services describe asset-info-test \
  --project=st-asset-project --region=asia-northeast3 --format='value(status.url)'
