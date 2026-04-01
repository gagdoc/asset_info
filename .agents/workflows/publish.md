---
description: How to modify, sync to GitHub, and deploy to Google Cloud Run
---

// turbo-all
# 🚀 Standard Publication Workflow

Follow these steps to ensure consistent development, source control, and deployment.

## 1. Local Modification & Testing
1. Make necessary code changes in `frontend/` or `backend/`.
2. Test locally:
   - Backend: `uvicorn backend.main:app --reload`
   - Frontend: `cd frontend && npm run dev`
3. Verify the changes in the browser at `http://localhost:5173`.

## 2. GitHub Synchronization
Always sync your changes to the remote repository before or after deployment.
1. Stage changes: `git add .`
2. Commit with a descriptive message: `git commit -m "Your description"`
3. Push to GitHub: `git push origin main`

## 3. Google Cloud Run Deployment
Use the automated deployment script to publish to the cloud.
1. Ensure `deployment_config.json` contains the correct `project_id` and `service_name` (default: `asset-info`).
2. Run the deployment script: `./deploy.sh`
3. The script will:
   - Authenticate using the service account key in `data/`.
   - Build the container from source.
   - Deploy to Cloud Run in `asia-northeast3`.
   - Set the `GOOGLE_CREDENTIALS_JSON` environment variable for Google Sheets access.
4. Verify the production URL: `https://asset-info-1015498761413.asia-northeast3.run.app/dashboard`

## ⚠️ Critical Configuration
- **Spreadsheet ID**: Defined in `config.py`.
- **Service Account**: `asset-manager@st-asset-project.iam.gserviceaccount.com`.
- **Permissions**: Ensure the service account has **Artifact Registry Administrator**, **Storage Admin**, **Cloud Build Editor**, and **Cloud Run Admin** roles.
