# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack Kanban project management app. The frontend is a working MVP; the backend (FastAPI, SQLite, AI chat) is planned per a 10-part roadmap in `docs/PLAN.md` and `AGENTS.md`.

## Development Commands

All commands run from the `frontend/` directory:

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm run test:unit    # Vitest unit tests (single run)
npm run test:unit:watch  # Vitest in watch mode
npm run test:e2e     # Playwright e2e tests (auto-starts dev server)
npm run test:all     # Unit + e2e
```

Run a single unit test file:
```bash
npx vitest run src/components/KanbanBoard.test.tsx
```

## Architecture

### Frontend (`frontend/src/`)

**Data model** (`lib/kanban.ts`): `BoardData` holds a `columns: Column[]` array and a `cards: Record<string, Card>` map (denormalized for O(1) lookups). Column ordering is maintained via `cardIds: string[]` arrays on each column.

**Component tree**:
```
page.tsx → KanbanBoard (client component)
  └── DndContext (dnd-kit)
      ├── KanbanColumn[] → KanbanCard[] (useSortable)
      │                 └── NewCardForm
      └── DragOverlay → KanbanCardPreview
```

**Drag-and-drop**: Uses dnd-kit with `closestCorners` collision detection. `moveCard()` in `lib/kanban.ts` handles both intra-column reordering and inter-column moves. Drop targets can be either a card (insert before) or a column header (append).

**State**: All state lives in `KanbanBoard` via `useState`/`useMemo`. No persistence yet — backend integration is a future milestone.

### Backend (`backend/`)

Currently just a `Dockerfile` placeholder. The planned stack is Python FastAPI + SQLite. See `docs/PLAN.md` for the implementation roadmap.

## Design Tokens

Defined as CSS variables in `frontend/src/app/globals.css` (Tailwind v4):
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991`
- Dark Navy: `#032147`
- Fonts: Space Grotesk (display), Manrope (body)

## Path Alias

`@/*` maps to `frontend/src/*` (configured in `tsconfig.json`).
