from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel
import secrets

from app.database import get_connection

router = APIRouter(prefix="/api")


class UserResponse(BaseModel):
    username: str


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
def me(request: Request, response: Response) -> UserResponse:
    username = get_current_user(request)
    # If authenticated via Entra ID but no session cookie, create one
    # so subsequent requests (e.g. from frontend JS) also work
    entra_user = request.headers.get("X-MS-CLIENT-PRINCIPAL-NAME")
    if entra_user and not request.cookies.get("session"):
        token = secrets.token_hex(32)
        conn = get_connection()
        conn.execute("INSERT INTO sessions (token, username) VALUES (?, ?)", (token, username))
        conn.commit()
        conn.close()
        response.set_cookie(key="session", value=token, httponly=True, samesite="lax", secure=True)
    return UserResponse(username=username)


def _get_or_create_entra_user(username: str) -> str:
    """Ensure an Entra ID user exists in the local DB and return their username."""
    conn = get_connection()
    row = conn.execute("SELECT username FROM users WHERE username = ?", (username,)).fetchone()
    if not row:
        conn.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (username, "entra-id-managed"),
        )
        conn.commit()
    conn.close()
    return username


def get_current_user(request: Request) -> str:
    # Check for Entra ID identity header first
    entra_user = request.headers.get("X-MS-CLIENT-PRINCIPAL-NAME")
    if entra_user:
        return _get_or_create_entra_user(entra_user)

    # Fall back to session cookie auth
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_connection()
    row = conn.execute("SELECT username FROM sessions WHERE token = ?", (token,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return row["username"]
