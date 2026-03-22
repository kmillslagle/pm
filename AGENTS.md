# The Project Management MVP web app

## Business Requirements

This project is building a Project Management App. Key features:
- A user can sign in or create an account
- When signed in, the user sees a project selector dropdown and can create new projects
- Each project has a Kanban board with fixed columns that can be renamed
- The cards on the Kanban board can be moved with drag and drop, and edited
- There is an AI chat feature in a sidebar; the AI is able to create / edit / move one or more cards
- Chat history is scoped per project

## Current State

The app is a working full-stack application with:
- User registration and login (passwords are salted and hashed)
- Multiple projects per user with a dropdown selector and inline creation form
- Persistent Kanban boards backed by SQLite
- AI chat sidebar powered by Claude API (Anthropic)
- Docker-based deployment

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use the Claude API (Anthropic) for the AI calls. An ANTHROPIC_API_KEY is in .env in the project root
- Use `claude-sonnet-4-20250514` as the model
- Use SQLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.