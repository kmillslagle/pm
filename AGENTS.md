# Kanban Studio

## Business Requirements

This project is building a full-stack Project Management App. Key features:

- A user can sign in or create an account
- When signed in, the user sees a project selector and can create new projects
- Each project has a Kanban board with configurable columns (user chooses count and names at creation time)
- Cards can be moved with drag and drop, edited inline, and expanded to show rich detail fields: notes, priority level, due date, and subtasks
- There is an AI chat feature in a sidebar; the AI can create, edit, and move cards, and can also build an entire new board from an elaborate natural-language prompt
- The AI asks clarifying questions when needed before generating a board
- New boards created by the AI appear immediately in the project list
- Chat history is scoped per project
- Auth uses persistent sessions (survives container restarts)

## Current State

The backend is a complete FastAPI + SQLite application with:
- User registration and login (passwords are salted and hashed)
- Multiple boards per user with CRUD endpoints
- Persistent Kanban data in SQLite
- AI chat using the Claude API (Anthropic) with structured JSON outputs

**The frontend is currently disconnected from the backend.** It runs entirely off localStorage and uses a local regex-based chat engine instead of the real AI. Reconnecting the frontend to the backend is the first priority (see docs/FIX_PLAN.md).

## Target State

Once fully implemented:
- Frontend calls the backend API for all data (no localStorage persistence)
- Auth is end-to-end with persistent DB-backed sessions
- AI chat calls the real Claude API via the backend
- Cards have expanded fields: notes, priority, due date, subtasks
- Boards can be created with any column count and custom column names
- The AI can generate a complete board from a detailed prompt

## Technical Decisions

- Next.js frontend (statically built, served by FastAPI)
- Python FastAPI backend, serves static Next.js site at /
- Everything packaged into a single Docker container
- `uv` as the Python package manager
- Claude API (Anthropic) for AI — model: `claude-sonnet-4-20250514`
- SQLite for persistence; DB auto-created on first run
- Sessions stored in SQLite (not in-memory)
- Start/stop scripts for Mac, Linux, and Windows in scripts/

## Color Scheme

- Accent Yellow: `#ecad0a` — accent lines, highlights
- Blue Primary: `#209dd7` — links, key sections
- Purple Secondary: `#753991` — submit buttons, important actions
- Dark Navy: `#032147` — main headings
- Gray Text: `#888888` — supporting text, labels
- Fonts: Space Grotesk (display), Manrope (body)

## Coding Standards

1. Use latest versions of libraries and idiomatic approaches
2. Keep it simple — never over-engineer, always simplify, no unnecessary defensive programming
3. No extra features beyond what is specified
4. Be concise; keep documentation minimal; no emojis ever
5. When hitting issues, identify root cause before trying a fix — prove with evidence, then fix

## Working Documentation

All planning documents are in `docs/`:
- `docs/PLAN.md` — full feature roadmap with checklists
- `docs/FIX_PLAN.md` — step-by-step implementation plan for bringing the current codebase to the target state
- `docs/database-schema.json` — SQLite schema reference
- `docs/fftc_prompt.md` — example elaborate prompt for testing the AI board builder
