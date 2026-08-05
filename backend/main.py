from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import sys
import os
from backend.routers import assets, consumables, admin, rentals
from backend.routers import export as export_router

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
    "http://localhost:5174",
    "http://127.0.0.1:5174",
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

@app.middleware("http")
async def add_no_cache_header(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

app.include_router(assets.router)
app.include_router(consumables.router)
app.include_router(rentals.router)
app.include_router(admin.router)    # 개발용 관리 API (운영에서는 403 반환)
app.include_router(export_router.router)  # 공용 xlsx 내보내기

# Mount React App
frontend_build_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")

if os.path.exists(frontend_build_path):
    # Serve static assets
    app.mount("/static", StaticFiles(directory=os.path.join(frontend_build_path, "static")), name="static")

    # Catch-all route for React SPA routing
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        file_path = os.path.join(frontend_build_path, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        # Fallback to index.html
        return FileResponse(os.path.join(frontend_build_path, "index.html"))

