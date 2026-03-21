# Frontend

Next.js (React) frontend for Kanban Studio, built as a static export served by the FastAPI backend.

## Structure

- `src/app/page.tsx` - Root page: handles auth check, login form, renders KanbanBoard + AISidebar
- `src/app/layout.tsx` - Root layout with metadata
- `src/app/globals.css` - Global styles and CSS variables (color scheme)
- `src/lib/kanban.ts` - Board data types (BoardData, Column, Card), `moveCard`, `createId`, `initialData`
- `src/lib/api.ts` - API client: getMe, login, logout, getBoard, saveBoard, chatWithAI
- `src/components/KanbanBoard.tsx` - Controlled Kanban board (accepts boardData + onBoardChange props)
- `src/components/KanbanColumn.tsx` - Column with sortable cards and rename input
- `src/components/KanbanCard.tsx` - Draggable card with delete button
- `src/components/KanbanCardPreview.tsx` - Drag overlay preview
- `src/components/NewCardForm.tsx` - Add card form
- `src/components/AISidebar.tsx` - Fixed right sidebar with AI chat

## Auth Flow

On load, calls `GET /api/auth/me`. If 401, shows login form inline. Credentials: `user` / `password`.

## Build

Static export (`output: "export"`) produces `out/` directory served by FastAPI.

```
npm run build   # produces out/
npm test        # vitest unit tests
```

## API Calls

All API calls use relative paths (same origin in production). Set `NEXT_PUBLIC_API_URL` env var for dev.
