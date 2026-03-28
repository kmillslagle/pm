# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack Kanban project management app with multi-project support, user accounts, compact cards with rich metadata, and AI chat. The AI can manage individual cards or build entire boards from a natural-language prompt. Includes a built-in sample project for onboarding. Built with Next.js frontend, Python FastAPI backend, SQLite database, and the Claude API. Runs in Docker.

## Self-Maintenance Rule

After every major change (new model, new page, new controller, route changes, migration changes, new test files, architectural shifts), update this CLAUDE.md file to reflect the current state. Specifically:

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

### Data Hierarchy

```
Project
  └── Workstream (1 or more per project; each is a `boards` DB row)
        └── Column (varying count/names per workstream)
              └── Card
```

A **project** is the top-level container. Each project has one or more **workstreams**, and each workstream has its own independent set of **columns**. The number and names of columns can differ between workstreams within the same project.

The project board header shows the project name, stats, and **workstream tabs**. Users select a tab to view one workstream at a time. The active workstream's columns and cards are displayed below. Users can add workstreams and columns inline from the header without leaving the board.

Standalone boards (no project) are also supported for simple use cases.

### Sample Project

A hardcoded sample project ("Sample-Bake a cake") is defined in `frontend/src/lib/sampleProject.ts` and always appears first in the project list. It has 2 workstreams with 3 cards each, demonstrating all card fields (priority, deliverable type, dependencies, notes, subtasks, key references).

Key behaviors:
- Uses a special project ID (`SAMPLE_PROJECT_ID = -999`) — never hits the backend
- Data is deep-cloned from the constant on each selection, so it resets every time
- All interactions (drag, edit, add cards/columns/workstreams) work locally in state but are **not persisted** to the database
- `ProjectBoard` receives `isSample` prop to skip all API calls when true

### Card Data Model

Each card contains:
- **Title**: Short, action-oriented (e.g., "Draft Dual-Block Voting Amendment")
- **Description** (`details`): 2-4 sentences defining scope and deliverable
- **Priority**: `high` / `medium` / `low` / `none`
- **Deliverable Type** (`deliverable_type`): Memo, Draft Amendment, Agreement, Analysis, Checklist, Policy, or Template
- **Key References** (`key_references`): Relevant OA sections, trust instrument articles, statutes, or IRC provisions
- **Dependencies** (`dependencies`): JSON array of card titles/IDs that must be completed first
- **Notes**: Free-form text area that persists with the card
- **Subtasks** (`subtasks`): JSON array of `{id, title, done}` objects
- **Due Date** (`due_date`): Optional date string

**Card UI:**
- **Board view (KanbanCard)**: Compact layout showing title (truncated), 2-line description, and priority badge (H/M/L). Edit and Delete buttons appear on hover. No expand/collapse — clicking Edit opens the full detail modal.
- **Detail modal (CardDetailModal)**: Full edit view for all fields. All edits are local until the user clicks the **Save** button (no auto-save on blur). Save and Delete buttons are side by side at the bottom.
- **Deliverable Type**: Users can select from presets (Memo, Draft Amendment, Agreement, Analysis, Checklist, Policy, Template) or type a custom deliverable type via a text input.

### Frontend (`frontend/src/`)

**Data model** (`lib/kanban.ts`): `BoardData` holds `columns: Column[]` and `cards: Record<string, Card>` (O(1) lookups). `ProjectBoardData` holds `workstreams: WorkstreamData[]` where each workstream has its own columns and cards. `WorkstreamData` includes `id`, `name`, `columns`, and `cards`.

**Sample project** (`lib/sampleProject.ts`): Hardcoded `ProjectBoardData` constant for the "Sample-Bake a cake" demo project. Imported by `page.tsx`.

**API client** (`lib/api.ts`): Typed async functions for all backend endpoints. Key functions:
- `getProjectBoard(projectId)` — fetches all workstreams with columns and cards in one call
- `createProjectBoard(projectId, workstreams)` — batch-creates multiple workstreams with columns
- `addColumn(boardId, title)` — adds a column to an existing board/workstream
- Auth functions (`login`, `register`, `logout`, `getMe`) handle session cookies

**Component tree**:
```
page.tsx (auth check, project selector, layout)
  ├── LoginForm (sign in / create account toggle, inline errors)
  ├── ProjectWizard (multi-step: project name → workstream names → columns per workstream → review)
  ├── ProjectBoard (tabbed single-workstream view for projects)
  │   ├── Header: project name, workstream tabs, + Add Workstream, stats
  │   └── Active workstream:
  │       └── DndContext (dnd-kit)
  │           ├── KanbanColumn[] → KanbanCard[] (useSortable)
  │           │                 └── NewCardForm
  │           └── DragOverlay → KanbanCardPreview
  ├── KanbanBoard (used for standalone boards only)
  │   └── DndContext (dnd-kit)
  │       ├── KanbanColumn[] → KanbanCard[] (useSortable)
  │       └── DragOverlay → KanbanCardPreview
  ├── CardDetailModal (full edit view: all card fields)
  └── ChatSidebar (AI chat, calls backend /api/chat, scoped per boardId)
      └── Board Builder mode (multi-turn prompt → full board generation)
```

**ProjectBoard**: Shows one workstream at a time, selected via tabs in the header. Each tab shows the workstream name and card count. The active workstream's columns render below with a single `DndContext`. `KanbanBoard` is used only for standalone boards not associated with a project.

**Inline editing in ProjectBoard**: Users can add workstreams (inline input next to tabs, creates with 3 default columns) and add columns to the active workstream (inline form via "+ Column" button in workstream sub-header) without leaving the board view.

**Drag-and-drop**: Uses dnd-kit with `closestCorners` collision detection. `moveCard()` in `lib/kanban.ts` handles both intra-column reordering and inter-column moves.

**State**: Auth state and project list live in `page.tsx`. Project board state (`ProjectBoardData`) is loaded via `getProjectBoard()` and passed to `ProjectBoard`. The sample project is loaded from the frontend constant (no API call). Standalone board state lives in `KanbanBoard`. All real project data is persisted to the backend; localStorage is not used.

### Backend (`backend/`)

Python FastAPI app serving the API and the static Next.js build.

**Modules**:
- `app/main.py` — FastAPI entry point, mounts routers, serves static files
- `app/auth.py` — Auth routes (login, register, logout, me); salted/hashed passwords; DB-backed session tokens in httponly cookies
- `app/board.py` — Board/project CRUD, column/card operations; card fields include priority, notes, due_date, subtasks, dependencies, deliverable_type, key_references
- `app/ai.py` — AI chat using Claude API with structured JSON outputs scoped per board; supports card-level actions and `create_board` action for building full boards from prompts
- `app/database.py` — SQLite schema init, connection helper; sessions stored in DB; migrations add new card columns via ALTER TABLE

**Key API endpoints**:
- `GET /api/projects/{id}/board` — Returns all workstreams with their columns and cards in one response
- `POST /api/projects/{id}/board` — Batch-creates multiple workstreams with columns in one transaction
- `GET /api/projects/{id}/workstreams` — Lists workstreams in a project
- `POST /api/projects/{id}/workstreams` — Creates a single workstream
- `POST /api/boards/{id}/columns` — Adds a new column to an existing board/workstream
- Standard card CRUD: `POST /api/columns/{id}/cards`, `PUT /api/cards/{id}`, `DELETE /api/cards/{id}`, `PUT /api/cards/{id}/move`

**Auth**: Passwords are salted and hashed (SHA-256). Sessions are stored in a `sessions` DB table (not in-memory) so they survive container restarts. Session tokens travel as httponly cookies.

**Multi-project**: Each user can have multiple projects. Each project has multiple workstreams. All card/column operations verify ownership through the user→board→column→card chain.

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
