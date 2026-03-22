# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack Kanban project management app with multi-project support, user accounts, expandable cards, and AI chat. The AI can manage individual cards or build entire boards from a natural-language prompt. Built with Next.js frontend, Python FastAPI backend, SQLite database, and the Claude API. Runs in Docker.

## Development Commands

Frontend commands (run from `frontend/`):

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm run test:unit    # Vitest unit tests (single run)
npm run test:unit:watch  # Vitest in watch mode
npm run test:e2e     # Playwright e2e tests (auto-starts dev server)
npm run test:all     # Unit + e2e
```

Backend commands (run from `backend/`):

```bash
uv run pytest tests/ -v    # Run backend tests
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000  # Run locally
```

Docker (run from project root):

```bash
scripts/start.bat    # Windows: build and start at http://localhost:8000
scripts/stop.bat     # Windows: stop
./scripts/start.sh   # Mac/Linux: build and start
./scripts/stop.sh    # Mac/Linux: stop
```

Run a single test file:
```bash
npx vitest run src/components/KanbanBoard.test.tsx   # frontend
uv run pytest tests/test_api.py::TestBoards -v       # backend
```

## Architecture

### Frontend (`frontend/src/`)

**Data model** (`lib/kanban.ts`): `BoardData` holds a `columns: Column[]` array and a `cards: Record<string, Card>` map (denormalized for O(1) lookups). Column ordering is maintained via `cardIds: string[]` arrays on each column. Cards include extended fields: `priority`, `notes`, `dueDate`, `subtasks`.

**API client** (`lib/api.ts`): Typed async functions for all backend endpoints. All board and chat functions require a `boardId` parameter. Auth functions (`login`, `register`, `logout`, `getMe`) handle session cookies.

**Component tree**:
```
page.tsx (auth check, project selector, layout)
  ├── LoginForm (sign in / create account toggle, inline errors)
  ├── ProjectWizard (multi-step: name → column count/names → review)
  ├── KanbanBoard (client component, receives boardId prop)
  │   └── DndContext (dnd-kit)
  │       ├── KanbanColumn[] → KanbanCard[] (useSortable)
  │       │                 └── NewCardForm
  │       │                 └── CardDetailModal (expanded view: notes, priority, due date, subtasks)
  │       └── DragOverlay → KanbanCardPreview
  └── ChatSidebar (AI chat, calls backend /api/chat, scoped per boardId)
      └── Board Builder mode (multi-turn prompt → full board generation)
```

**Drag-and-drop**: Uses dnd-kit with `closestCorners` collision detection. `moveCard()` in `lib/kanban.ts` handles both intra-column reordering and inter-column moves.

**State**: Auth state and project list live in `page.tsx`. Board state lives in `KanbanBoard` via `useState`/`useMemo`. All data is persisted to the backend; localStorage is not used for persistence.

### Backend (`backend/`)

Python FastAPI app serving the API and the static Next.js build.

**Modules**:
- `app/main.py` — FastAPI entry point, mounts routers, serves static files
- `app/auth.py` — Auth routes (login, register, logout, me); salted/hashed passwords; DB-backed session tokens in httponly cookies
- `app/board.py` — Board/project CRUD, column/card operations; accepts custom column names at board creation; full card fields including priority, notes, due_date, subtasks
- `app/ai.py` — AI chat using Claude API with structured JSON outputs scoped per board; supports card-level actions and `create_board` action for building full boards from prompts
- `app/database.py` — SQLite schema init, connection helper; sessions stored in DB

**Auth**: Passwords are salted and hashed (SHA-256). Sessions are stored in a `sessions` DB table (not in-memory) so they survive container restarts. Session tokens travel as httponly cookies.

**Multi-project**: Each user can have multiple boards. All card/column operations verify ownership through the user→board→column→card chain. New boards are created with either custom column names or 5 default columns.

**AI Board Builder**: The `/api/chat` endpoint supports a `create_board` structured output action. When the AI determines it has enough information (after asking clarifying questions), it returns a `create_board` action with full column and card definitions. The frontend calls `POST /api/boards/from-ai` to atomically create the board and then switches to it.

## Design Tokens

Defined as CSS variables in `frontend/src/app/globals.css` (Tailwind v4):
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991`
- Dark Navy: `#032147`
- Fonts: Space Grotesk (display), Manrope (body)

## Path Alias

`@/*` maps to `frontend/src/*` (configured in `tsconfig.json`).
