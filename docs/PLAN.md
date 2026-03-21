# Project Plan

## Part 1: Plan [DONE]

- [x] Explore frontend codebase and write `frontend/AGENTS.md`
- [x] Enrich this document with detailed steps, substeps, and success criteria
- [x] User reviews and approves plan

---

## Part 2: Scaffolding

Goal: Docker container runs, serves static HTML from FastAPI, and a test API endpoint responds.

### Steps

- [ ] Write `backend/main.py` — FastAPI app with:
  - `GET /api/health` returning `{"status": "ok"}`
  - Static file mount serving `backend/static/` at `/`
  - `backend/static/index.html` with "Hello World" text and a fetch call to `/api/health`
- [ ] Write `backend/requirements.txt` (or `pyproject.toml` for uv) with `fastapi`, `uvicorn`
- [ ] Write `Dockerfile`:
  - Install uv, install Python deps via uv
  - Build Next.js frontend (`npm ci && npm run build`)
  - Copy Next.js `out/` into `backend/static/`
  - Expose port 8000, run uvicorn
- [ ] Write `scripts/start.sh` (Linux/Mac) and `scripts/start.bat` (Windows):
  - Build Docker image, run container mapping port 8000
- [ ] Write `scripts/stop.sh` / `scripts/stop.bat` — stop and remove container

### Tests & Success Criteria

- `curl http://localhost:8000/api/health` returns `{"status": "ok"}`
- `curl http://localhost:8000/` returns HTML containing "Hello World"
- Browser opens `http://localhost:8000/` and the page shows "Hello World" and confirms the API call succeeded (visible in the page or console)
- Start and stop scripts work end-to-end without errors

---

## Part 3: Add in Frontend

Goal: The real Next.js frontend (static export) is served by FastAPI; kanban board visible at `/`.

### Steps

- [ ] Configure Next.js for static export: set `output: 'export'` in `next.config.ts`
  - Ensure trailing slash and base path are correct for serving from FastAPI root
- [ ] Update `Dockerfile` to build frontend (`npm ci && npm run build`), copy `frontend/out/` into place for FastAPI to serve
- [ ] Update FastAPI static file mount to serve the Next.js export
- [ ] Verify Next.js `Link` and client-side navigation work correctly when served from FastAPI

### Tests & Success Criteria

- Unit tests: `npm run test:unit` passes (all existing Vitest tests green)
- E2E tests: `npm run test:e2e` passes against the built/served app (adjust base URL if needed)
- Opening `http://localhost:8000/` shows the full Kanban board UI
- Drag-and-drop works in the browser
- No console errors

---

## Part 4: Fake User Sign-in

Goal: Visiting `/` redirects unauthenticated users to `/login`; login with `user`/`password` grants access; logout returns to `/login`.

### Steps

- [ ] Add `/login` page in Next.js (`src/app/login/page.tsx`) with username/password form
- [ ] On submit, POST to `/api/auth/login` with credentials
- [ ] Add FastAPI route `POST /api/auth/login`:
  - Accepts `{"username": "user", "password": "password"}`
  - Returns a signed session token (simple JWT or signed cookie)
  - Rejects wrong credentials with 401
- [ ] Add FastAPI middleware or dependency to protect non-`/api/auth` routes — return 401 if unauthenticated
- [ ] In Next.js, store the token (httpOnly cookie via backend, or localStorage) and include on API calls
- [ ] Add auth guard on the kanban page: redirect to `/login` if no valid session
- [ ] Add `POST /api/auth/logout` route that clears the session
- [ ] Add logout button to the kanban UI

### Tests & Success Criteria

- Unit tests: login form renders, shows error on bad credentials, redirects on success
- Backend tests (pytest): `/api/auth/login` returns 200 for correct creds, 401 for wrong
- E2E test: visiting `/` without session redirects to `/login`; logging in with `user`/`password` shows kanban; logout returns to `/login`
- Invalid credentials show an error message, do not redirect

---

## Part 5: Database Modeling

Goal: Agree on a SQLite schema for users, boards, columns, and cards.

### Steps

- [ ] Design schema (tables: `users`, `boards`, `columns`, `cards`) — document in `docs/DB_SCHEMA.md`
- [ ] Document column ordering approach (integer `position` field)
- [ ] Save schema as `docs/schema.json` (JSON representation for agent reference)
- [ ] User reviews and approves schema

### Schema (proposed)

```
users:   id (PK), username (unique), password_hash
boards:  id (PK), user_id (FK), title
columns: id (PK), board_id (FK), title, position
cards:   id (PK), column_id (FK), title, details, position
```

### Tests & Success Criteria

- User has approved the schema
- `docs/DB_SCHEMA.md` exists and is clear
- `docs/schema.json` exists and matches the approved schema

---

## Part 6: Backend API

Goal: FastAPI routes allow full CRUD on columns and cards for an authenticated user; SQLite DB created on first run.

### Steps

- [ ] Add SQLAlchemy (or raw sqlite3) models matching the approved schema
- [ ] Add DB initialization: create tables if not exist on startup; seed default board/columns for new user on first login
- [ ] Add routes:
  - `GET /api/board` — return full board (columns + cards) for current user
  - `PUT /api/columns/{id}` — rename a column
  - `POST /api/cards` — create a card in a column
  - `PUT /api/cards/{id}` — update card title/details or move to new column/position
  - `DELETE /api/cards/{id}` — delete a card
- [ ] All routes require authentication (reuse auth middleware from Part 4)

### Tests & Success Criteria

- pytest unit tests cover every route:
  - Happy path (correct data returned / mutated)
  - Auth required (401 if no session)
  - 404 for unknown IDs
- DB file is created automatically if missing
- After restart, data persists (test by writing then restarting the server in a test)

---

## Part 7: Frontend + Backend Integration

Goal: The kanban board reads from and writes to the backend; data persists across refreshes.

### Steps

- [ ] Replace `initialData` with an API call to `GET /api/board` on page load
- [ ] On column rename: call `PUT /api/columns/{id}`
- [ ] On card add: call `POST /api/cards`
- [ ] On card move (drag-drop): call `PUT /api/cards/{id}` with new column/position
- [ ] On card delete: call `DELETE /api/cards/{id}`
- [ ] On card edit (title/details): call `PUT /api/cards/{id}`
- [ ] Handle loading and error states simply (no complex spinners — just disable UI during in-flight requests)
- [ ] Update E2E tests to run against the full stack (Docker container)

### Tests & Success Criteria

- Unit tests: components call correct API endpoints with correct payloads (mock fetch)
- E2E tests: full flow — login, add card, rename column, drag card, refresh page — data persists
- No data is lost on page refresh
- All existing unit tests still pass

---

## Part 8: AI Connectivity

Goal: Backend can make a successful call to OpenRouter and return a response.

### Steps

- [ ] Add `openai` Python package (OpenRouter is OpenAI-compatible) to dependencies
- [ ] Add `GET /api/ai/ping` route: sends `{"role": "user", "content": "What is 2+2?"}` to OpenRouter using `openai/gpt-oss-120b`, returns the response text
- [ ] Read `OPENROUTER_API_KEY` from environment (loaded from `.env` in Docker)
- [ ] Pass `.env` into the Docker container via `--env-file` in start scripts

### Tests & Success Criteria

- `curl http://localhost:8000/api/ai/ping` returns a response containing "4"
- pytest test (marked as integration, skipped if no API key): calls `/api/ai/ping` and asserts non-empty response
- If `OPENROUTER_API_KEY` is missing, route returns a clear 500 error (not a crash)

---

## Part 9: AI Kanban Integration

Goal: The AI receives the full board state and conversation history; responds with structured output that optionally updates the board.

### Steps

- [ ] Define structured output schema:
  ```json
  {
    "reply": "string",
    "board_update": null | { "columns": [...], "cards": {...} }
  }
  ```
- [ ] Add `POST /api/ai/chat` route:
  - Accepts `{"message": "...", "history": [...]}`
  - Fetches current board state from DB
  - Sends system prompt (board JSON + instructions) + history + new message to OpenRouter
  - Requests structured output (JSON mode or function calling)
  - If `board_update` is non-null, applies the update to the DB
  - Returns `{"reply": "...", "board_updated": true/false}`
- [ ] System prompt instructs the AI on how to represent board updates

### Tests & Success Criteria

- pytest integration tests (with real API key):
  - "Add a card called 'Test Task' to Backlog" → board_update contains the new card
  - "Move the first card to Done" → board_update reflects the move
  - "What cards are in progress?" → reply answers the question, board_update is null
- Unit tests (mocked OpenRouter): correct payload shape sent, DB updated when board_update present

---

## Part 10: AI Chat Sidebar

Goal: A sidebar in the UI allows full AI conversation; the board refreshes automatically when the AI makes changes.

### Steps

- [ ] Add sidebar component (`AIChatSidebar.tsx`):
  - Toggle open/closed button (fixed position)
  - Message history display (user + AI messages)
  - Text input + send button
  - Loading state while AI responds
- [ ] On send: POST to `/api/ai/chat` with message and history
- [ ] On response: append AI reply to history; if `board_updated: true`, re-fetch `GET /api/board` and update kanban state
- [ ] Style using existing design tokens (accent yellow, primary blue, etc.)
- [ ] The sidebar does not obscure the kanban board on wide screens (side-by-side layout)

### Tests & Success Criteria

- Unit tests: sidebar renders, sends correct payload, displays AI reply, triggers board refresh on `board_updated: true`
- E2E test: type "Add a card called 'AI Task' to Backlog" → submit → AI reply appears → Backlog column now contains "AI Task" card without manual refresh
- Sidebar open/close toggle works
- Loading state shown during API call
