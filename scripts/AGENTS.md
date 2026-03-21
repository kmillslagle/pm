# Scripts

Start and stop scripts for running Kanban Studio via Docker.

## Files

- `start.sh` - Start the app (Mac/Linux)
- `stop.sh` - Stop the app (Mac/Linux)
- `start.bat` - Start the app (Windows)
- `stop.bat` - Stop the app (Windows)

## Usage

1. Copy `.env.example` to `.env` and set your `ANTHROPIC_API_KEY`
2. Run `./scripts/start.sh` (or `scripts\start.bat` on Windows)
3. Open http://localhost:8000
4. Login with username: `user`, password: `password`
5. To stop: `./scripts/stop.sh` (or `scripts\stop.bat`)
