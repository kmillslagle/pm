# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack Kanban project management app with multi-project support, user accounts, and AI chat. Built with Next.js frontend, Python FastAPI backend, SQLite database, and Claude API for AI features. Runs in Docker.

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

**Data model** (`lib/kanban.ts`): `BoardData` holds a `columns: Column[]` array and a `cards: Record<string, Card>` map (denormalized for O(1) lookups). Column ordering is maintained via `cardIds: string[]` arrays on each column.

**Component tree**:
```
page.tsx (project selector, auth, layout)
  ├── LoginForm (sign in / create account toggle)
  ├── KanbanBoard (client component, receives boardId prop)
  │   └── DndContext (dnd-kit)
  │       ├── KanbanColumn[] → KanbanCard[] (useSortable)
  │       │                 └── NewCardForm
  │       └── DragOverlay → KanbanCardPreview
  └── ChatSidebar (AI chat, scoped per project via boardId)
```

**Drag-and-drop**: Uses dnd-kit with `closestCorners` collision detection. `moveCard()` in `lib/kanban.ts` handles both intra-column reordering and inter-column moves. Drop targets can be either a card (insert before) or a column header (append).

**State**: Project selection and auth state live in `page.tsx`. Board state lives in `KanbanBoard` via `useState`/`useMemo`. All data is persisted to the backend.

**API client** (`lib/api.ts`): Typed functions for all backend endpoints. Board and chat functions require a `boardId` parameter. Auth functions (`login`, `register`, `logout`, `getMe`) handle session cookies.

### Backend (`backend/`)

Python FastAPI app serving the API and static frontend build.

**Modules**:
- `app/main.py` - FastAPI entry point, mounts routers, serves static files
- `app/auth.py` - Auth routes (login, register, logout, me) with salted/hashed passwords and session cookies
- `app/board.py` - Board/project CRUD, column/card operations with ownership verification
- `app/ai.py` - AI chat using Claude API with structured JSON outputs, scoped per board
- `app/database.py` - SQLite schema init and connection helper

**Auth**: Passwords are salted and hashed (SHA-256). Sessions are in-memory token-to-username mappings stored in httponly cookies. Legacy seed user ("user"/"password") supports plain-text password for backwards compatibility.

**Multi-project**: Each user can have multiple boards (projects). All card/column operations verify ownership through the user->board->column->card chain. New boards are created with 5 default columns.

## Design Tokens

Defined as CSS variables in `frontend/src/app/globals.css` (Tailwind v4):
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991`
- Dark Navy: `#032147`
- Fonts: Space Grotesk (display), Manrope (body)

## Path Alias

`@/*` maps to `frontend/src/*` (configured in `tsconfig.json`).
