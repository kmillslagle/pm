from fastapi import APIRouter, HTTPException, Response, Request
from pydantic import BaseModel
import secrets

router = APIRouter(prefix="/api")

# Simple in-memory session store
sessions: dict[str, str] = {}

class LoginRequest(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    username: str

VALID_USERNAME = "user"
VALID_PASSWORD = "password"

@router.post("/auth/login")
def login(body: LoginRequest, response: Response) -> UserResponse:
    if body.username != VALID_USERNAME or body.password != VALID_PASSWORD:
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
