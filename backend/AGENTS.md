# Backend

Python FastAPI backend serving the Kanban Studio app.

## Structure

- `main.py` - FastAPI app, mounts static files, includes routers
- `database.py` - SQLAlchemy SQLite engine, session factory, `create_tables()`
- `models.py` - ORM models: User, Board, Session. Board stores full JSON state.
- `auth.py` - Login/logout/me endpoints, session cookie auth, `get_current_user` dependency
- `board.py` - GET/PUT `/api/board` endpoints
- `ai.py` - POST `/api/ai/chat` endpoint using OpenRouter

## Auth

Hardcoded credentials: username `user`, password `password`. Session stored in DB, sent as httponly cookie.

## Database

SQLite at `DB_PATH` env var (default `/data/kanban.db`). Board data stored as JSON blob.

## AI

Uses OpenRouter with model `openai/gpt-4o`. Requires `OPENROUTER_API_KEY` env var.
Returns `{message, board}` JSON - board is null unless AI wants to update it.

## Running

```
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
