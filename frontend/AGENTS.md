# Frontend Codebase Guide

## Overview

Kanban Studio: a single-board kanban workspace built with Next.js 15, React 19, TypeScript, and Tailwind CSS v4. This is a pure frontend demo (no backend yet) running on the Next.js app router.

## Directory Structure

```
frontend/
├── src/
│   ├── app/              # Next.js app router
│   │   ├── layout.tsx    # Root layout, fonts, metadata
│   │   └── page.tsx      # Home page - renders KanbanBoard
│   ├── components/       # React UI components
│   │   ├── KanbanBoard.tsx       # Main orchestrator: state, drag-drop context
│   │   ├── KanbanColumn.tsx      # Column with rename and card list
│   │   ├── KanbanCard.tsx        # Individual card with delete
│   │   ├── KanbanCardPreview.tsx # Read-only card shown during drag
│   │   └── NewCardForm.tsx       # Toggle form for adding cards
│   ├── lib/
│   │   ├── kanban.ts     # Types, initialData, moveCard, createId
│   │   └── kanban.test.ts
│   └── test/
│       └── setup.ts      # Vitest/jsdom setup
├── tests/
│   └── kanban.spec.ts    # Playwright e2e tests
└── [config files]
```

## Key Types (src/lib/kanban.ts)

```typescript
Card:    { id: string; title: string; details: string }
Column:  { id: string; title: string; cardIds: string[] }
BoardData: { columns: Column[]; cards: Record<string, Card> }
```

## State Management

No external library. `KanbanBoard` owns all state via `useState`:
- `boardData: BoardData` — columns array + cards map
- Per-column local state in `KanbanColumn` for rename/form toggle

## Components

**KanbanBoard** — owns board state, wraps everything in `@dnd-kit/core` DndContext and SortableContext, handles `onDragEnd` to call `moveCard()`.

**KanbanColumn** — receives column + cards as props, handles inline rename (click title to edit), renders `KanbanCard` list and `NewCardForm`.

**KanbanCard** — renders title/details, delete button. Implements `useSortable` for drag handles.

**KanbanCardPreview** — read-only version used as drag overlay in `DragOverlay`.

**NewCardForm** — toggles open/closed, emits `onAdd(title, details)` to parent.

## Design Tokens (globals.css)

```
--accent-yellow:    #ecad0a
--primary-blue:     #209dd7
--secondary-purple: #753991
--navy-dark:        #032147
--gray-text:        #888888
```

Fonts: Space Grotesk (display/headings), Manrope (body).

## Tests

**Unit** (Vitest + React Testing Library):
- `src/lib/kanban.test.ts` — moveCard logic (3 tests)
- `src/components/KanbanBoard.test.tsx` — render, rename, add/remove cards (3 tests)

Run: `npm run test:unit`

**E2E** (Playwright, Chromium only):
- `tests/kanban.spec.ts` — load board, add card, drag card (3 tests)

Run: `npm run test:e2e` (starts dev server on :3000 automatically)

## Key Scripts

```
npm run dev          # Dev server on :3000
npm run build        # Production build
npm run test:unit    # Unit tests (vitest)
npm run test:e2e     # E2E tests (playwright)
npm run test:all     # Both
```

## What Does NOT Exist Yet

- No authentication / login page
- No backend API calls (all data is hardcoded in `initialData`)
- No Docker setup
- No AI chat sidebar
- No persistence (state resets on refresh)
