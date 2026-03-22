# FIX_PLAN.md — Implementation Plan

This document describes exactly how to take the current codebase to the target state defined in PLAN.md, AGENTS.md, and CLAUDE.md. Execute the phases in order; later phases depend on earlier ones.

---

## Current State Summary

- **Backend**: Complete. FastAPI + SQLite with auth, boards, cards, AI chat via Claude API.
- **Frontend**: Disconnected from backend. Runs entirely off localStorage. Uses a local regex `chatEngine.ts` instead of the real AI. No login/auth UI rendered in `page.tsx`.
- **Gap**: The frontend and backend exist independently. No end-to-end data flow.

---

## Phase 1 — Reconnect Frontend to Backend

**Goal**: Replace localStorage-based state with real API calls. Restore auth. Wire the AI chat to the backend.

### 1.1 Create `frontend/src/lib/api.ts`

Write typed async functions for every backend endpoint. Handle HTTP errors by throwing with the error detail string from the JSON response. Use `credentials: 'include'` on every fetch so session cookies are sent.

Functions to implement:
```
// Auth
getMe(): Promise<{ username: string } | null>
login(username, password): Promise<{ username: string }>
register(username, password, email?): Promise<{ username: string }>
logout(): Promise<void>

// Boards
listBoards(): Promise<{ id: number; name: string }[]>
createBoard(name, columns?: string[]): Promise<{ id: number; name: string }>
getBoard(boardId): Promise<BoardResponse>
createBoardFromAI(payload): Promise<{ id: number; name: string }>

// Columns
renameColumn(columnId, title): Promise<void>

// Cards
createCard(columnId, title, details?): Promise<CardResponse>
updateCard(cardId, fields): Promise<CardResponse>
deleteCard(cardId): Promise<void>
moveCard(cardId, columnId, position): Promise<void>

// Chat
sendChat(boardId, message): Promise<ChatResponse>
getChatHistory(boardId): Promise<ChatMessage[]>
```

### 1.2 Update `page.tsx`

Replace the entire localStorage-based initialization with:

1. On mount, call `getMe()`. If it returns a user, set auth state and load boards. If it returns null (401), show `LoginForm`.
2. Replace `loadProjects()` / `saveProjects()` with `listBoards()` / `createBoard()`.
3. Replace `loadBoard()` / `saveBoard()` with `getBoard(boardId)` — board data comes from the API.
4. Remove all imports from `lib/storage.ts`.
5. Add `handleLogin` and `handleLogout` handlers that call `api.login()` / `api.logout()` and update auth state.
6. Pass `boardId: number` (not a string UUID) to `KanbanBoard` and `ChatSidebar`.
7. On `handleCreateProject`, call `createBoard(name, columns)` and refresh the board list.

### 1.3 Update `KanbanBoard.tsx`

All card and column mutations must call the API and then update local state on success:
- Card create → `createCard(columnId, title)`
- Card update → `updateCard(cardId, fields)`
- Card delete → `deleteCard(cardId)`
- Card move (drag-drop) → `moveCard(cardId, targetColumnId, position)`
- Column rename → `renameColumn(columnId, title)`

Remove any localStorage write calls. Local state is the source of truth for rendering; the backend is the source of truth for persistence.

### 1.4 Update `ChatSidebar.tsx`

Replace the `processChat()` call from `chatEngine.ts` with a call to `api.sendChat(boardId, message)`.

- On mount (when `isOpen` becomes true), call `getChatHistory(boardId)` and populate the message list.
- When a message is sent, call `sendChat(boardId, message)`. Show "Thinking..." while awaiting.
- If the response includes `board_updates`, call the parent's `onBoardRefresh()` callback so the board reloads from the API.
- Remove the import of `processChat` and `chatEngine`.

### 1.5 Update `ProjectWizard.tsx`

On "Create Project" (final step), call `api.createBoard(name, columnNames)` instead of the localStorage `createProject()` function. Pass the resolved column titles array.

### 1.6 Remove `lib/storage.ts` and `lib/chatEngine.ts`

These files become unused after the above changes. Delete them. Remove all imports.

### 1.7 Tests

- Backend: all existing tests in `tests/test_api.py` must still pass.
- Frontend: update `KanbanBoard.test.tsx` to mock `lib/api.ts` instead of localStorage. Add tests for the login flow.

**Phase 1 done when**: Login works end-to-end. Creating a board, adding cards, and refreshing the page all work. The AI chat sends messages to the real Claude API and updates the board.

---

## Phase 2 — AI Board Builder

**Goal**: Allow the AI to generate a complete board (columns + cards) from an elaborate natural-language prompt.

### 2.1 Extend `backend/app/ai.py`

Add `create_board` to the structured output schema:

```python
class ColumnDef(BaseModel):
    title: str
    cards: list[dict] = []  # each: { "title": str, "details": str }

class BoardAction(BaseModel):
    action: str  # "create_board"
    name: str
    columns: list[ColumnDef]

class ChatResponse(BaseModel):
    reply: str
    board_updates: list[CardAction] = []
    create_board: BoardAction | None = None
```

Update `SYSTEM_PROMPT` to include:
- The AI may return a `create_board` object when the user wants a new board built from a prompt.
- The AI should ask clarifying questions (e.g., project name, number of columns, focus areas) before generating a board if the prompt is ambiguous.
- The AI should not create a board until it has a project name and a clear understanding of the workstreams.

### 2.2 Add `POST /api/boards/from-ai` to `backend/app/board.py`

```python
class AiCardDef(BaseModel):
    title: str
    details: str = ""

class AiColumnDef(BaseModel):
    title: str
    cards: list[AiCardDef] = []

class AiBoardCreate(BaseModel):
    name: str
    columns: list[AiColumnDef]
```

The endpoint creates the board, all columns, and all cards in a single transaction. Returns `BoardInfo` (id, name).

### 2.3 Update `ChatSidebar.tsx`

- Add a "Build a Board" button at the top of the chat sidebar.
- When clicked, send a priming message: "I want to build a new Kanban board. I'll describe my project and you can ask me questions before generating the board."
- When `sendChat` returns a response with `create_board` set, call `api.createBoardFromAI(payload)`, then call `onBoardCreated(newBoardId)` on the parent.
- In `page.tsx`, `onBoardCreated` refreshes the boards list and switches to the new board.

### 2.4 Tests

- Backend: test `POST /api/boards/from-ai` with a payload containing 4 columns and 30 cards total. Verify all cards are created and associated correctly.
- Backend: test that the chat endpoint correctly parses and returns a `create_board` response when the AI mock returns one.

**Phase 2 done when**: User can type an elaborate project description in chat, the AI asks 1–2 clarifying questions, then creates and switches to a fully populated board.

---

## Phase 3 — Expandable Cards with Rich Fields

**Goal**: Cards have notes, priority, due date, and subtasks. Clicking a card opens a detail panel.

### 3.1 Database migration in `database.py`

In `init_db()`, after the main `CREATE TABLE IF NOT EXISTS` block, add:

```python
# Migrate cards table — add new columns if they don't exist
for col_def in [
    ("priority", "TEXT NOT NULL DEFAULT 'none'"),
    ("notes",    "TEXT NOT NULL DEFAULT ''"),
    ("due_date", "TEXT"),
    ("subtasks", "TEXT NOT NULL DEFAULT '[]'"),
]:
    try:
        conn.execute(f"ALTER TABLE cards ADD COLUMN {col_def[0]} {col_def[1]}")
    except Exception:
        pass  # Column already exists
conn.commit()
```

### 3.2 Update `backend/app/board.py`

- Add `priority`, `notes`, `due_date`, `subtasks` to `CardCreate` and `CardUpdate` models.
- Update all `SELECT` queries to include the new fields.
- Update `PUT /api/cards/{id}` to handle partial updates on any combination of fields.
- `subtasks` is stored as a JSON string; the backend passes it through as-is.

### 3.3 Update `backend/app/ai.py`

- Include `priority`, `notes`, `due_date`, `subtasks` in the board JSON passed to the AI.
- Update `CardAction` to include optional `priority` and `notes` fields for card create/update actions.

### 3.4 Create `frontend/src/components/CardDetailModal.tsx`

A modal that opens when a card is clicked. Props: `card`, `columns`, `onSave(fields)`, `onDelete()`, `onClose()`.

Fields:
- **Title**: editable text input, auto-saved on blur
- **Priority**: segmented control or dropdown — High (red), Medium (yellow), Low (blue), None (gray)
- **Notes**: textarea, auto-saved on blur
- **Due date**: date input
- **Subtasks**: list of checkboxes; add new subtask with an input + Enter; delete subtask with an X button
- **Delete card**: red button at the bottom, with confirmation

On save (blur or explicit save), call `api.updateCard(cardId, changedFields)`.

### 3.5 Update `KanbanCard.tsx`

- Add a priority badge (colored dot or pill) to the compact card view when `priority !== 'none'`.
- Wire click to open `CardDetailModal` (not drag).
- Drag should still be initiated by a dedicated drag handle or by mousedown on the card body after a short delay.

### 3.6 Update `lib/api.ts`

Add `priority`, `notes`, `dueDate`, `subtasks` to the `Card` type and the `updateCard` function signature.

### 3.7 Tests

- Backend: test creating a card with all new fields, updating priority and notes independently, verifying subtasks round-trip as JSON.
- Frontend: unit test `CardDetailModal` — renders fields, calls `onSave` on blur, calls `onDelete` on delete confirmation.

**Phase 3 done when**: Clicking any card opens the detail modal. All fields save to the backend. Priority badge shows on the compact card.

---

## Phase 4 — Column Count and Names at Board Creation

**Goal**: The board creation flow (wizard and API) accepts custom column names. The AI builder also uses this.

### 4.1 Update `backend/app/board.py`

```python
class BoardCreate(BaseModel):
    name: str
    columns: list[str] = []  # empty list = use defaults
```

In `POST /api/boards`:
```python
column_names = body.columns if body.columns else ["Backlog", "Discovery", "In Progress", "Review", "Done"]
```

### 4.2 Update `backend/app/auth.py`

Extract the default column creation into a shared helper in `board.py` (e.g., `create_default_columns(conn, board_id, column_names)`). Call it from both `POST /api/boards` and the register endpoint so the logic is not duplicated.

### 4.3 Wire `ProjectWizard.tsx` to backend

(This is already handled in Phase 1.5 — passing `columnNames` to `api.createBoard(name, columnNames)`.)

Confirm the wizard sends the resolved column titles array from both the template and custom paths.

### 4.4 Tests

- Backend: test `POST /api/boards` with a `columns` array of 3 custom names. Verify exactly 3 columns are created with those names.
- Backend: test `POST /api/boards` with no `columns` field. Verify 5 default columns are created.

**Phase 4 done when**: The wizard creates boards with user-specified column names. The API accepts and uses custom columns.

---

## Phase 5 — Auth Hardening

**Goal**: Sessions survive container restarts. Legacy plain-text password is gone. Password requirements are stronger. Login form is improved.

### 5.1 Add `sessions` table to `database.py`

```sql
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Remove the legacy seed user insert:
```sql
-- DELETE these lines:
INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'user', 'password');
```

The seed user can remain if created with a hashed password, or be removed entirely. If kept:
```python
seed_salt = "seed"
seed_hash = hashlib.sha256((seed_salt + "password").encode()).hexdigest()
conn.execute(
    "INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'user', ?)",
    (f"{seed_salt}:{seed_hash}",)
)
```

### 5.2 Rewrite session handling in `auth.py`

Replace the in-memory `sessions: dict[str, str] = {}` with DB reads/writes:

```python
# On login/register — save session
conn.execute("INSERT INTO sessions (token, username) VALUES (?, ?)", (token, username))

# On get_current_user — read session
row = conn.execute("SELECT username FROM sessions WHERE token = ?", (token,)).fetchone()

# On logout — delete session
conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
```

Remove the legacy plain-text password fallback in `login()`. All passwords must be `salt:hash` format.

### 5.3 Strengthen password validation

In both `register()` and `LoginForm.tsx`:
- Minimum 8 characters
- Clear error message: "Password must be at least 8 characters"

### 5.4 Add email field

In `database.py`:
```sql
-- In users table definition:
email TEXT
```

Add migration:
```python
try:
    conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
except Exception:
    pass
```

In `auth.py` `register()`, accept optional `email` in the request body and store it.

### 5.5 Update `LoginForm.tsx`

- Add password confirmation field on the register tab; validate client-side before submitting
- Show field-level inline errors (not just a top banner)
- Clarify the sign in / create account toggle with clear tab labels
- Disable the submit button while the request is in flight
- On successful register, transition to the board view (same as login)

### 5.6 Tests

- Backend: register a user, restart the session dict (simulate container restart by clearing DB sessions table — actually just test that the DB session lookup works), login again, verify session is valid.
- Backend: attempt login with old plain-text password format — should fail.
- Backend: register with 7-character password — should return 400.
- Frontend: unit test `LoginForm` — password mismatch shows error, short password shows error, submit disabled while loading.

**Phase 5 done when**: Sessions persist across container restarts. No plain-text passwords in the codebase. The register form validates passwords client-side. All auth tests pass.

---

## Final Verification

After all phases are complete, run the full test suite:

```bash
# Backend
cd backend && uv run pytest tests/ -v

# Frontend unit
cd frontend && npm run test:unit

# Frontend e2e
cd frontend && npm run test:e2e
```

Then do a manual end-to-end smoke test:
1. Start fresh Docker container (no existing DB)
2. Register a new account
3. Create a board via the wizard with custom column names
4. Add cards, set priorities, add notes and subtasks
5. Drag cards between columns
6. Use AI chat to move a card
7. Use the AI board builder with a multi-paragraph prompt
8. Verify the new board appears and is populated
9. Log out, restart the container, log back in — verify session is restored and all data is present
