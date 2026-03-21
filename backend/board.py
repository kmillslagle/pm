import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from .database import get_db
from .models import Board, User
from .auth import get_current_user

router = APIRouter()


@router.get("/board")
def get_board(user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    board = db.query(Board).filter(Board.user_id == user.id).first()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    return json.loads(board.data)


@router.put("/board")
def save_board(body: dict, user: User = Depends(get_current_user), db: DbSession = Depends(get_db)):
    board = db.query(Board).filter(Board.user_id == user.id).first()
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    board.data = json.dumps(body)
    db.commit()
    return {"ok": True}
