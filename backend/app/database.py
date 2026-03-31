import sqlite3
from pathlib import Path

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_DATA_DIR.mkdir(exist_ok=True)
DB_PATH = _DATA_DIR / "kanban.db"

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn

def init_db() -> None:
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            name TEXT NOT NULL DEFAULT 'My Board',
            project_id INTEGER REFERENCES projects(id)
        );
        CREATE TABLE IF NOT EXISTS board_columns (
            id TEXT PRIMARY KEY,
            board_id INTEGER NOT NULL REFERENCES boards(id),
            title TEXT NOT NULL,
            position INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cards (
            id TEXT PRIMARY KEY,
            column_id TEXT NOT NULL REFERENCES board_columns(id),
            title TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT '',
            position INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER REFERENCES boards(id),
            role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)

    conn.commit()

    # Migrations — add columns if they don't exist
    try:
        conn.execute("ALTER TABLE boards ADD COLUMN project_id INTEGER REFERENCES projects(id)")
    except Exception:
        pass

    for col_def in [
        ("priority", "TEXT NOT NULL DEFAULT 'none'"),
        ("notes", "TEXT NOT NULL DEFAULT ''"),
        ("due_date", "TEXT"),
        ("subtasks", "TEXT NOT NULL DEFAULT '[]'"),
        ("dependencies", "TEXT NOT NULL DEFAULT '[]'"),
        ("deliverable_type", "TEXT NOT NULL DEFAULT ''"),
        ("key_references", "TEXT NOT NULL DEFAULT ''"),
    ]:
        try:
            conn.execute(f"ALTER TABLE cards ADD COLUMN {col_def[0]} {col_def[1]}")
        except Exception:
            pass
    try:
        conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE chat_messages ADD COLUMN project_id INTEGER REFERENCES projects(id)")
    except Exception:
        pass
    conn.commit()
    conn.close()
