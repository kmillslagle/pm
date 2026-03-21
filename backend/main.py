import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .database import create_tables
from . import auth, board, ai

app = FastAPI(title="Kanban Studio")


@app.on_event("startup")
def startup():
    create_tables()


app.include_router(auth.router, prefix="/api/auth")
app.include_router(board.router, prefix="/api")
app.include_router(ai.router, prefix="/api")

static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
