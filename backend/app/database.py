import hashlib
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "kanban.db"

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db() -> None:
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            name TEXT NOT NULL DEFAULT 'My Board'
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
            board_id INTEGER NOT NULL REFERENCES boards(id),
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

    # Seed user with hashed password
    seed_salt = "seed"
    seed_hash = hashlib.sha256((seed_salt + "password").encode()).hexdigest()
    conn.execute(
        "INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'user', ?)",
        (f"{seed_salt}:{seed_hash}",),
    )
    conn.execute("INSERT OR IGNORE INTO boards (id, user_id, name) VALUES (1, 1, 'My Board')")
    conn.execute("""
        INSERT OR IGNORE INTO board_columns (id, board_id, title, position) VALUES
            ('col-backlog', 1, 'Backlog', 0),
            ('col-discovery', 1, 'Discovery', 1),
            ('col-progress', 1, 'In Progress', 2),
            ('col-review', 1, 'Review', 3),
            ('col-done', 1, 'Done', 4)
    """)
    conn.commit()

    # Migrations — add columns if they don't exist
    for col_def in [
        ("priority", "TEXT NOT NULL DEFAULT 'none'"),
        ("notes", "TEXT NOT NULL DEFAULT ''"),
        ("due_date", "TEXT"),
        ("subtasks", "TEXT NOT NULL DEFAULT '[]'"),
    ]:
        try:
            conn.execute(f"ALTER TABLE cards ADD COLUMN {col_def[0]} {col_def[1]}")
        except Exception:
            pass
    try:
        conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
    except Exception:
        pass
    conn.commit()
    conn.close()
