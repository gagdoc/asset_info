from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import sys
import os
from backend.routers import assets, consumables

# Add parent directory to sys.path to allow imports from root
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from config import PAGE_TITLE
except ImportError:
    PAGE_TITLE = "Asset Management System"

app = FastAPI(title=PAGE_TITLE)

# CORS Configuration
origins = [
    "http://localhost:5173",  # Vite default port
    "http://127.0.0.1:5173",
]
# Allow dynamic origin from env (for Cloud Run if needed)
if "ALLOWED_ORIGIN" in os.environ:
    origins.append(os.environ["ALLOWED_ORIGIN"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

app.include_router(assets.router)
app.include_router(consumables.router)

# Mount React App
frontend_build_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if os.path.exists(frontend_build_path):
    # Serve static assets
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_build_path, "assets")), name="assets")

    # Catch-all route for React SPA routing
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        file_path = os.path.join(frontend_build_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        # Fallback to index.html
        return FileResponse(os.path.join(frontend_build_path, "index.html"))

