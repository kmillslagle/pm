from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel
import hashlib
import secrets

from app.database import get_connection

router = APIRouter(prefix="/api")

# Simple in-memory session store
sessions: dict[str, str] = {}

class LoginRequest(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    username: str

def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((salt + password).encode()).hexdigest()

@router.post("/auth/register")
def register(body: LoginRequest, response: Response) -> UserResponse:
    if len(body.username.strip()) < 1:
        raise HTTPException(status_code=400, detail="Username is required")
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    salt = secrets.token_hex(16)
    hashed = _hash_password(body.password, salt)
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (body.username.strip(), f"{salt}:{hashed}"),
        )
        user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        # Create a default board with columns for the new user
        conn.execute(
            "INSERT INTO boards (user_id, name) VALUES (?, 'My Board')",
            (user_id,),
        )
        board_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        conn.executemany(
            "INSERT INTO board_columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
            [
                (f"col-{secrets.token_hex(4)}", board_id, "Backlog", 0),
                (f"col-{secrets.token_hex(4)}", board_id, "Discovery", 1),
                (f"col-{secrets.token_hex(4)}", board_id, "In Progress", 2),
                (f"col-{secrets.token_hex(4)}", board_id, "Review", 3),
                (f"col-{secrets.token_hex(4)}", board_id, "Done", 4),
            ],
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        if "UNIQUE constraint" in str(e):
            raise HTTPException(status_code=409, detail="Username already taken")
        raise
    finally:
        conn.close()
    token = secrets.token_hex(32)
    sessions[token] = body.username.strip()
    response.set_cookie(key="session", value=token, httponly=True, samesite="lax")
    return UserResponse(username=body.username.strip())

@router.post("/auth/login")
def login(body: LoginRequest, response: Response) -> UserResponse:
    conn = get_connection()
    row = conn.execute(
        "SELECT password FROM users WHERE username = ?", (body.username,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    stored = row["password"]
    # Support legacy unhashed passwords (from seed data)
    if ":" in stored:
        salt, hashed = stored.split(":", 1)
        if _hash_password(body.password, salt) != hashed:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    else:
        if body.password != stored:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    token = secrets.token_hex(32)
    sessions[token] = body.username
    response.set_cookie(key="session", value=token, httponly=True, samesite="lax")
    return UserResponse(username=body.username)

@router.post("/auth/logout")
def logout(request: Request, response: Response) -> dict:
    token = request.cookies.get("session")
    if token and token in sessions:
        del sessions[token]
    response.delete_cookie(key="session")
    return {"status": "ok"}

@router.get("/auth/me")
def me(request: Request) -> UserResponse:
    token = request.cookies.get("session")
    if not token or token not in sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return UserResponse(username=sessions[token])

def get_current_user(request: Request) -> str:
    token = request.cookies.get("session")
    if not token or token not in sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return sessions[token]
