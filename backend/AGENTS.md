# Backend

Python FastAPI backend serving the Kanban Studio API and static frontend.

## Structure

- `app/main.py` - FastAPI app entry point, mounts routers and serves static frontend
- `app/auth.py` - Authentication routes (register, login, logout, me) with salted/hashed passwords and session cookies
- `app/board.py` - Board/project CRUD and card/column operations with per-user ownership verification
- `app/ai.py` - AI chat endpoint using Claude API / Anthropic (model: claude-sonnet-4-20250514) with structured JSON outputs, scoped per board
- `app/database.py` - SQLite database initialization and connection helper
- `tests/test_api.py` - API tests covering auth, boards, and card operations

## API Endpoints

Auth:
- POST /api/auth/register - Create account with username/password
- POST /api/auth/login - Login with username/password
- POST /api/auth/logout - Logout
- GET /api/auth/me - Get current user

Boards:
- GET /api/boards - List all boards for current user
- POST /api/boards - Create a new board (with 5 default columns)
- GET /api/boards/{board_id} - Get full board data (columns, cards)

Columns and Cards:
- PUT /api/columns/{id} - Rename column
- POST /api/columns/{id}/cards - Create card
- PUT /api/cards/{id} - Update card
- DELETE /api/cards/{id} - Delete card
- PUT /api/cards/{id}/move - Move card between columns

Chat (requires board_id query parameter):
- POST /api/chat?board_id={id} - Send message to AI assistant
- GET /api/chat/history?board_id={id} - Get chat history

Other:
- GET /api/health - Health check
- GET /api/board - Legacy single-board endpoint (returns first board)

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
