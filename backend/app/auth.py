from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel
import hashlib
import secrets

from app.database import get_connection

router = APIRouter(prefix="/api")


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str | None = None


class UserResponse(BaseModel):
    username: str


def _hash_password(password: str, salt: str) -> str:
    return hashlib.sha256((salt + password).encode()).hexdigest()


@router.post("/auth/register")
def register(body: RegisterRequest, response: Response) -> UserResponse:
    if len(body.username.strip()) < 1:
        raise HTTPException(status_code=400, detail="Username is required")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    salt = secrets.token_hex(16)
    hashed = _hash_password(body.password, salt)
    conn = get_connection()
    try:
        conn.execute(
            "INSERT INTO users (username, password, email) VALUES (?, ?, ?)",
            (body.username.strip(), f"{salt}:{hashed}", body.email),
        )
        user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        # Create a default board with columns for the new user
        from app.board import create_columns
        conn.execute(
            "INSERT INTO boards (user_id, name) VALUES (?, 'My Board')",
            (user_id,),
        )
        board_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        create_columns(conn, board_id)
        conn.commit()
    except Exception as e:
        conn.rollback()
        if "UNIQUE constraint" in str(e):
            raise HTTPException(status_code=409, detail="Username already taken")
        raise
    finally:
        conn.close()
    token = secrets.token_hex(32)
    conn = get_connection()
    conn.execute("INSERT INTO sessions (token, username) VALUES (?, ?)", (token, body.username.strip()))
    conn.commit()
    conn.close()
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
    if ":" not in stored:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    salt, hashed = stored.split(":", 1)
    if _hash_password(body.password, salt) != hashed:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = secrets.token_hex(32)
    conn = get_connection()
    conn.execute("INSERT INTO sessions (token, username) VALUES (?, ?)", (token, body.username))
    conn.commit()
    conn.close()
    response.set_cookie(key="session", value=token, httponly=True, samesite="lax")
    return UserResponse(username=body.username)


@router.post("/auth/logout")
def logout(request: Request, response: Response) -> dict:
    token = request.cookies.get("session")
    if token:
        conn = get_connection()
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()
        conn.close()
    response.delete_cookie(key="session")
    return {"status": "ok"}


@router.get("/auth/me")
def me(request: Request) -> UserResponse:
    username = get_current_user(request)
    return UserResponse(username=username)


def get_current_user(request: Request) -> str:
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_connection()
    row = conn.execute("SELECT username FROM sessions WHERE token = ?", (token,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return row["username"]
