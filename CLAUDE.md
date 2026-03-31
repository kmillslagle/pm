# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack Kanban project management app — fully project-based (no standalone boards). Features Entra ID authentication, compact cards with rich metadata, and a project-scoped AI chat assistant that can manage workstreams, columns, and cards with a plan-first workflow. Includes a built-in sample project for onboarding. Built with Next.js frontend, Python FastAPI backend, SQLite database, and the Claude API. Deployed to Azure App Service; also runs locally in Docker.

## Self-Maintenance Rule

After every major change (new model, new page, new controller, route changes, migration changes, new test files, architectural shifts), update this CLAUDE.md file to reflect the current state. Update the Architecture, API endpoints, component tree, and any other sections affected by the change.

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
npx vitest run src/components/ProjectBoard.test.tsx   # frontend
uv run pytest tests/test_api.py::TestBoards -v        # backend
```

Azure deployment (run from project root):

```bash
bash scripts/deploy-azure.sh     # First-time: creates all Azure resources and deploys
bash scripts/redeploy-azure.sh   # Code updates: rebuild image and restart
bash scripts/teardown-azure.sh   # Delete all Azure resources
```

Live URL: `https://kanban-studio-app.azurewebsites.net`

Azure resources: Resource Group `kanban-studio-rg`, ACR `kanbanstudioacr`, App Service `kanban-studio-app`, Storage `kanbanstudiostore` with file share `kanban-data` mounted at `/app/data`. Entra ID app registration `Kanban Studio` (single-tenant, client ID `247ec411-f9dd-4b51-b97e-7a53ed35f2b4`).

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

The app is fully project-based — there are no standalone boards. Every board lives inside a project.

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
- `updateProject(projectId, name)` — renames a project
- `addColumn(boardId, title)` — adds a column to an existing board/workstream
- `sendProjectChat(projectId, message)` — project-scoped AI chat
- `getProjectChatHistory(projectId)` — project chat history
- `uploadPdf(file)` — extracts text from a PDF file via backend
- Auth functions (`logout`, `getMe`) — Entra ID provides authentication; session cookies used for API calls

**Component tree**:
```
page.tsx (Entra ID auth check, project selector, layout)
  ├── ProjectWizard (manual: project name → workstream names → columns → review; or AI chat: creates project and uses sendProjectChat API with plan-first flow)
  ├── ProjectBoard (tabbed single-workstream view for projects)
  │   ├── Header: project name, workstream tabs, + Add Workstream, stats
  │   └── Active workstream:
  │       └── DndContext (dnd-kit)
  │           ├── KanbanColumn[] → KanbanCard[] (useSortable)
  │           │                 └── NewCardForm
  │           └── DragOverlay → KanbanCardPreview
  ├── CardDetailModal (full edit view: all card fields)
  └── ChatSidebar (project-scoped AI chat, calls /api/chat/project)
      ├── Plan display with Approve/Revise buttons
      ├── Workstream progress indicator
      ├── Quick actions: Assess quality, Add workstream, Help
      ├── PDF upload button (extracts text via /api/upload/pdf, sends as chat message)
      └── Auto-growing textarea for long prompts
```

**ProjectBoard**: Shows one workstream at a time, selected via tabs in the header. Each tab shows the workstream name and card count. The active workstream's columns render below with a single `DndContext`.

**Inline editing in ProjectBoard**: Users can add workstreams (inline input next to tabs, creates with 3 default columns) and add columns to the active workstream (inline form via "+ Column" button in workstream sub-header) without leaving the board view.

**Drag-and-drop**: Uses dnd-kit with `closestCorners` collision detection. `moveCard()` in `lib/kanban.ts` handles both intra-column reordering and inter-column moves.

**State**: Auth state and project list live in `page.tsx`. Project board state (`ProjectBoardData`) is loaded via `getProjectBoard()` and passed to `ProjectBoard`. The sample project is loaded from the frontend constant (no API call). All real project data is persisted to the backend; localStorage is not used.

### Backend (`backend/`)

Python FastAPI app serving the API and the static Next.js build.

**Modules**:
- `app/main.py` — FastAPI entry point, mounts routers, serves static files
- `app/auth.py` — Auth routes (logout, me); Entra ID header-based auth with auto-provisioning; DB-backed session tokens in httponly cookies
- `app/board.py` — Board/project CRUD, column/card operations; card fields include priority, notes, due_date, subtasks, dependencies, deliverable_type, key_references
- `app/ai.py` — Project-scoped AI chat using Claude API. Supports 8 action types (rename_project, create_workstream, add_column, rename_column, create_card, update_card, move_card, delete_card) with all card fields. Plan-first workflow for complex changes. Skills: Board Builder, Board Quality Assessment, Card Enrichment, Workstream Management.
- `app/database.py` — SQLite schema init, connection helper with `busy_timeout=5000` to prevent lock errors; sessions stored in DB; migrations add new card/chat columns via ALTER TABLE

**Key API endpoints**:
- `PUT /api/projects/{id}` — Renames a project
- `GET /api/projects/{id}/board` — Returns all workstreams with their columns and cards in one response
- `POST /api/projects/{id}/board` — Batch-creates multiple workstreams with columns in one transaction
- `GET /api/projects/{id}/workstreams` — Lists workstreams in a project
- `POST /api/projects/{id}/workstreams` — Creates a single workstream
- `POST /api/boards/{id}/columns` — Adds a new column to an existing board/workstream
- `POST /api/chat/project?project_id={id}` — Project-scoped AI chat (replaces old board-scoped `/api/chat`)
- `GET /api/chat/project/history?project_id={id}` — Project chat history
- `POST /api/upload/pdf` — Extracts text from an uploaded PDF (uses PyMuPDF, 10MB limit)
- Standard card CRUD: `POST /api/columns/{id}/cards`, `PUT /api/cards/{id}`, `DELETE /api/cards/{id}`, `PUT /api/cards/{id}/move`

**Auth**: Azure Entra ID (single-tenant + guest users) via App Service Easy Auth. The `X-MS-CLIENT-PRINCIPAL-NAME` header identifies the user; the backend auto-creates local user records on first login. A session cookie is set on `/auth/me` for subsequent API calls. No login/register endpoints — Entra ID handles all authentication. Local dev falls back to session cookie auth.

**Multi-project**: Each user can have multiple projects. Each project has multiple workstreams. All card/column operations verify ownership through the user→board→column→card chain.

**AI Chat System**: Project-scoped via `POST /api/chat/project`. The AI receives full project state (all workstreams, columns, cards) and can execute 8 action types: `rename_project`, `create_workstream`, `add_column`, `rename_column`, `create_card` (all 9 fields), `update_card`, `move_card`, `delete_card`. Uses a plan-first workflow — for complex changes, the AI presents a plan for approval, then executes workstream-by-workstream. Chat history stored in `chat_messages` table with `project_id` (`board_id` is nullable for projects with no workstreams yet). Skills: Board Builder, Board Quality Assessment, Card Enrichment, Workstream Management.

**AI column resolution**: When creating cards in newly created workstreams (same batch), the AI uses `workstream_name` + `column_title` instead of `column_id`. The backend resolves these to real IDs by looking up the workstream by name and column by title. For existing workstreams, the AI uses real `column_id` values from the project state JSON.

**ProjectWizard AI chat**: The wizard's "Build with AI Chat" mode creates a blank project on the first message, then uses `sendProjectChat()` for all subsequent turns. The AI has full plan-first capability. Includes a PDF upload button for importing project descriptions from documents. An "Open Project" button appears once the project is created so the user can jump to the project board at any time.

**PDF upload**: Both ChatSidebar and ProjectWizard AI chat support PDF file upload. The file is sent to `POST /api/upload/pdf` which uses PyMuPDF to extract text. The extracted text is then sent as a chat message with instructions for the AI to build a project from it. Dependencies: `pymupdf` and `python-multipart` in `pyproject.toml`.

## Design Tokens

Defined as CSS variables in `frontend/src/app/globals.css` (Tailwind v4):
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991`
- Dark Navy: `#032147`
- Fonts: Space Grotesk (display), Manrope (body)

## Path Alias

`@/*` maps to `frontend/src/*` (configured in `tsconfig.json`).
