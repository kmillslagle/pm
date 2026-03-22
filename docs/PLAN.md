# Kanban Studio — Project Plan

---

## Completed Parts (1–10)

### Part 1: Plan ✅
Enriched this document with substeps, checklists, and success criteria. Created AGENTS.md files.

### Part 2: Scaffolding ✅
Docker infrastructure, FastAPI backend, start/stop scripts. "Hello world" served from backend.

### Part 3: Add in Frontend ✅
Next.js frontend statically built and served. Demo Kanban board at /. Unit and integration tests.

### Part 4: Fake user sign-in ✅
Login with dummy credentials ("user", "password") gates the Kanban view. Logout works.

### Part 5: Database modeling ✅
SQLite schema documented in docs/database-schema.json. Tables: users, boards, board_columns, cards, chat_messages.

### Part 6: Backend ✅
API routes for reading/writing Kanban data per user. Database auto-created on first run. Backend unit tests.

### Part 7: Frontend + Backend ✅
Frontend uses backend API. Persistent Kanban board. Thorough tests.

### Part 8: AI connectivity ✅
Backend makes Claude API calls via Anthropic SDK. Connectivity verified.

### Part 9: Structured AI outputs ✅
Backend sends board JSON + conversation history to Claude. AI responds with structured JSON including optional board updates. Tested.

### Part 10: AI chat sidebar ✅
Chat sidebar in the UI. AI can update the Kanban via structured outputs. Board refreshes automatically when AI makes changes.

---

## New Parts (11–15)

### Part 11: Reconnect Frontend to Backend

The frontend currently runs entirely off localStorage and does not call the backend API. The AI chat uses a local regex engine instead of the Claude API. This part wires everything together.

**Steps:**
- [ ] Create `frontend/src/lib/api.ts` with typed async functions for all backend endpoints (auth, boards, columns, cards, chat)
- [ ] Update `page.tsx` to check auth via `GET /api/auth/me` on load; show `LoginForm` when unauthenticated
- [ ] Replace localStorage project/board state with backend API calls (`GET /api/boards`, `POST /api/boards`, `GET /api/boards/{id}`)
- [ ] Update `KanbanBoard.tsx` card/column operations to call backend endpoints instead of updating local state only
- [ ] Replace `chatEngine.ts` (regex matcher) with real `POST /api/chat` calls in `ChatSidebar.tsx`
- [ ] Load chat history from `GET /api/chat/history` on board open
- [ ] Remove `lib/storage.ts` localStorage layer (or reduce to a thin cache)
- [ ] Update `ProjectWizard.tsx` to call `POST /api/boards` on completion
- [ ] Write frontend integration tests covering auth flow, board CRUD, and chat roundtrip

**Success criteria:**
- Refreshing the page preserves all board data (stored in SQLite, not localStorage)
- AI chat sends messages to the real Claude API and updates the board
- Login/logout works end-to-end with session cookies
- All existing backend tests still pass

---

### Part 12: AI Board Builder

Allow the AI chat to generate a complete Kanban board from an elaborate prompt (e.g., `docs/fftc_prompt.md`). The AI asks clarifying questions as needed, then creates the board with all columns and cards populated.

**Steps:**
- [ ] Add `create_board` action type to the backend AI structured output schema in `ai.py`:
  ```json
  {
    "action": "create_board",
    "name": "<board name>",
    "columns": [
      { "title": "<col title>", "cards": [{ "title": "...", "details": "..." }] }
    ]
  }
  ```
- [ ] Add `POST /api/boards/from-ai` endpoint that atomically creates a board with columns and cards from a structured payload; returns the new board ID and name
- [ ] Extend the AI system prompt to instruct the Claude model to:
  - Ask clarifying questions when a prompt is ambiguous or incomplete
  - Generate a full board payload when it has enough information
  - Default to 5 columns unless the user specifies otherwise
- [ ] Add a "Build a Board" button/mode to `ChatSidebar.tsx` that sets a special conversation context indicating board-builder mode
- [ ] When the AI returns a `create_board` action, call `POST /api/boards/from-ai`, then refresh the boards list and switch to the new board automatically
- [ ] Write backend tests for `POST /api/boards/from-ai` with multi-column, multi-card payloads
- [ ] Write a frontend test simulating the board-builder chat flow

**Success criteria:**
- User can paste the contents of `docs/fftc_prompt.md` into chat and receive a fully populated Kanban board
- The new board appears in the projects list immediately
- The AI asks at least one clarifying question before generating a complex board
- Board creation is atomic (all-or-nothing)

---

### Part 13: Expandable Cards with Rich Fields

Each Kanban card can be expanded to show and edit extended information: notes, priority level, due date, and subtasks. The compact card view shows the title and a priority badge.

**Steps:**
- [ ] Add migration logic in `database.py` `init_db()` to add new columns to `cards` if they don't exist:
  - `priority TEXT DEFAULT 'none'` — values: `'high'`, `'medium'`, `'low'`, `'none'`
  - `notes TEXT DEFAULT ''`
  - `due_date TEXT DEFAULT NULL`
  - `subtasks TEXT DEFAULT '[]'` — JSON array of `{ id, title, done }` objects
- [ ] Update `CardCreate` and `CardUpdate` Pydantic models in `board.py` to include the new fields
- [ ] Update all SELECT queries in `board.py` and `ai.py` to include the new fields
- [ ] Update `PUT /api/cards/{id}` to accept partial updates on any combination of new fields
- [ ] Create `frontend/src/components/CardDetailModal.tsx` — a modal/panel with:
  - Editable title
  - Priority selector (High / Medium / Low / None) with color coding
  - Notes textarea (auto-saved on blur)
  - Due date picker
  - Subtask checklist (add, check off, delete subtasks)
  - Delete card button
- [ ] Update `KanbanCard.tsx` to show a priority color badge and open `CardDetailModal` on click
- [ ] Update `lib/api.ts` typed functions to include the new card fields
- [ ] Write backend tests for creating and updating cards with the new fields
- [ ] Write frontend unit tests for `CardDetailModal`

**Success criteria:**
- Clicking a card opens the detail modal with all fields
- Changes are persisted to the backend immediately
- Priority badge is visible on the compact card
- Subtasks can be added, checked, and deleted
- Existing cards (without new fields) load without errors

---

### Part 14: Column Count and Names When Creating a Board

When creating a new board (via the wizard or the AI), the user is prompted to choose how many columns the board should have and can name each one. This applies to both manual creation and the AI board builder.

**Steps:**
- [ ] Update `BoardCreate` Pydantic model in `board.py` to accept an optional `columns: list[str]` field
- [ ] Update `POST /api/boards` to use provided column names if supplied; fall back to 5 default columns if not
- [ ] Update `auth.py` register endpoint to use the same default column logic as `board.py` (DRY)
- [ ] `ProjectWizard.tsx` already has column selection UI — wire it to pass `columns` to `POST /api/boards` (Part 11 dependency)
- [ ] Ensure the AI board builder (Part 12) also passes column names when creating a board
- [ ] Update backend tests to cover custom column creation

**Success criteria:**
- Creating a board via the wizard with custom columns stores those column names in the DB
- Creating a board with no column preference defaults to 5 standard columns
- The AI-generated board uses the column names it determined from the prompt

---

### Part 15: Auth Hardening

Review and strengthen the authentication system.

**Issues to fix:**
- Sessions stored in-memory (`sessions: dict`) are lost on container restart
- Legacy seed user (`user` / `password`) uses plain-text password storage
- Minimum password length is 4 characters (too weak)
- No password confirmation field on the register form
- No email field for future account recovery

**Steps:**
- [ ] Add `sessions` table to `database.py`:
  ```sql
  CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
- [ ] Rewrite `auth.py` to read/write sessions from the DB instead of the in-memory dict
- [ ] Remove the plain-text legacy seed user from `database.py` `init_db()`; the seed user should be created with a hashed password or removed entirely
- [ ] Raise minimum password length to 8 characters
- [ ] Add optional `email TEXT` column to `users` table; accept it in the register endpoint
- [ ] Update `LoginForm.tsx`:
  - Add password confirmation field on the register form
  - Show inline field-level error messages (not just a banner)
  - Improve sign in / create account toggle clarity
  - Disable submit button while request is in flight
- [ ] Write auth integration tests covering: register, login, logout, session persistence across restarts, duplicate username, password too short, password mismatch

**Success criteria:**
- Logging in, restarting the Docker container, and refreshing the page keeps the user logged in
- The legacy plain-text password path is gone
- Attempting to register with a password under 8 characters shows an error
- All auth tests pass
