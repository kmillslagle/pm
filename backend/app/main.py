from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.auth import router as auth_router
from app.ai import router as ai_router
from app.board import router as board_router
from app.database import init_db

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

app = FastAPI(title="Kanban Studio API")

init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(board_router)
app.include_router(ai_router)

# In Docker, static files are at /app/static; in dev, at ../frontend/out
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if not STATIC_DIR.is_dir():
    STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "out"


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# Serve frontend - must be registered after API routes
if STATIC_DIR.is_dir():
    @app.get("/")
    def serve_index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
else:
    @app.get("/")
    def root() -> dict:
        return {"message": "Kanban Studio API"}
