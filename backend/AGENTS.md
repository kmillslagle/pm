# Backend

Python FastAPI backend serving the Kanban Studio API and static frontend.

## Structure

- `app/main.py` - FastAPI app entry point, mounts routers and serves static frontend
- `app/auth.py` - Authentication routes (login, logout, me) with session cookies
- `app/board.py` - Board CRUD API routes (get board, rename column, create/delete/move/update cards)
- `app/ai.py` - AI chat endpoint using Claude API / Anthropic (model: claude-sonnet-4-20250514) with structured JSON outputs
- `app/database.py` - SQLite database initialization and connection helper
- `tests/test_api.py` - API tests covering auth and board endpoints

## API Endpoints

- POST /api/auth/login - Login with username/password
- POST /api/auth/logout - Logout
- GET /api/auth/me - Get current user
- GET /api/board - Get full board data
- PUT /api/columns/{id} - Rename column
- POST /api/columns/{id}/cards - Create card
- PUT /api/cards/{id} - Update card
- DELETE /api/cards/{id} - Delete card
- PUT /api/cards/{id}/move - Move card
- POST /api/chat - Send message to AI assistant
- GET /api/chat/history - Get chat history
- GET /api/health - Health check

## Running

```bash
cd backend
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Testing

```bash
cd backend
uv run pytest tests/ -v
```
