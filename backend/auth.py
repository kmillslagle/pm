import uuid
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from .database import get_db
from .models import Session, User, Board, DEFAULT_BOARD
import json

router = APIRouter()

HARDCODED_USER = "user"
HARDCODED_PASSWORD = "password"


def get_current_user(
    session_id: str | None = Cookie(default=None),
    db: DbSession = Depends(get_db),
) -> User:
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginRequest, response: Response, db: DbSession = Depends(get_db)):
    if body.username != HARDCODED_USER or body.password != HARDCODED_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = db.query(User).filter(User.username == body.username).first()
    if not user:
        user = User(username=body.username)
        db.add(user)
        db.flush()
        board = Board(user_id=user.id, data=json.dumps(DEFAULT_BOARD))
        db.add(board)
        db.commit()
        db.refresh(user)

    session_id = str(uuid.uuid4())
    session = Session(id=session_id, user_id=user.id)
    db.add(session)
    db.commit()

    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        samesite="lax",
    )
    return {"username": user.username}


@router.post("/logout")
def logout(response: Response, session_id: str | None = Cookie(default=None), db: DbSession = Depends(get_db)):
    if session_id:
        db.query(Session).filter(Session.id == session_id).delete()
        db.commit()
    response.delete_cookie("session_id")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"username": user.username}
