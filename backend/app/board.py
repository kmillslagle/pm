import secrets

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import get_connection

router = APIRouter(prefix="/api")


class CardCreate(BaseModel):
    title: str
    details: str = ""


class CardUpdate(BaseModel):
    title: str | None = None
    details: str | None = None


class ColumnUpdate(BaseModel):
    title: str


class CardMove(BaseModel):
    column_id: str
    position: int


class BoardResponse(BaseModel):
    columns: list[dict]
    cards: dict[str, dict]


def _get_board_id(username: str) -> int:
    conn = get_connection()
    row = conn.execute(
        "SELECT b.id FROM boards b JOIN users u ON b.user_id = u.id WHERE u.username = ?",
        (username,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Board not found")
    return row["id"]


@router.get("/board")
def get_board(request: Request) -> BoardResponse:
    username = get_current_user(request)
    board_id = _get_board_id(username)
    conn = get_connection()

    cols = conn.execute(
        "SELECT id, title, position FROM board_columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()

    columns = []
    cards = {}
    for col in cols:
        card_rows = conn.execute(
            "SELECT id, title, details FROM cards WHERE column_id = ? ORDER BY position",
            (col["id"],),
        ).fetchall()
        card_ids = []
        for card in card_rows:
            cards[card["id"]] = {"id": card["id"], "title": card["title"], "details": card["details"]}
            card_ids.append(card["id"])
        columns.append({"id": col["id"], "title": col["title"], "cardIds": card_ids})

    conn.close()
    return BoardResponse(columns=columns, cards=cards)


@router.put("/columns/{column_id}")
def update_column(column_id: str, body: ColumnUpdate, request: Request) -> dict:
    username = get_current_user(request)
    board_id = _get_board_id(username)
    conn = get_connection()
    result = conn.execute(
        "UPDATE board_columns SET title = ? WHERE id = ? AND board_id = ?",
        (body.title, column_id, board_id),
    )
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Column not found")
    return {"status": "ok"}


@router.post("/columns/{column_id}/cards")
def create_card(column_id: str, body: CardCreate, request: Request) -> dict:
    username = get_current_user(request)
    board_id = _get_board_id(username)
    conn = get_connection()

    # Verify column belongs to this board
    col = conn.execute(
        "SELECT id FROM board_columns WHERE id = ? AND board_id = ?",
        (column_id, board_id),
    ).fetchone()
    if not col:
        conn.close()
        raise HTTPException(status_code=404, detail="Column not found")

    # Get next position
    max_pos = conn.execute(
        "SELECT COALESCE(MAX(position), -1) as max_pos FROM cards WHERE column_id = ?",
        (column_id,),
    ).fetchone()["max_pos"]

    card_id = f"card-{secrets.token_hex(4)}"
    conn.execute(
        "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)",
        (card_id, column_id, body.title, body.details or "No details yet.", max_pos + 1),
    )
    conn.commit()
    conn.close()
    return {"id": card_id, "title": body.title, "details": body.details or "No details yet."}


@router.put("/cards/{card_id}")
def update_card(card_id: str, body: CardUpdate, request: Request) -> dict:
    username = get_current_user(request)
    _get_board_id(username)
    conn = get_connection()
    card = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
    if not card:
        conn.close()
        raise HTTPException(status_code=404, detail="Card not found")

    title = body.title if body.title is not None else card["title"]
    details = body.details if body.details is not None else card["details"]
    conn.execute("UPDATE cards SET title = ?, details = ? WHERE id = ?", (title, details, card_id))
    conn.commit()
    conn.close()
    return {"id": card_id, "title": title, "details": details}


@router.delete("/cards/{card_id}")
def delete_card(card_id: str, request: Request) -> dict:
    username = get_current_user(request)
    _get_board_id(username)
    conn = get_connection()
    result = conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    conn.commit()
    conn.close()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Card not found")
    return {"status": "ok"}


@router.put("/cards/{card_id}/move")
def move_card(card_id: str, body: CardMove, request: Request) -> dict:
    username = get_current_user(request)
    board_id = _get_board_id(username)
    conn = get_connection()

    card = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
    if not card:
        conn.close()
        raise HTTPException(status_code=404, detail="Card not found")

    # Verify target column belongs to this board
    col = conn.execute(
        "SELECT id FROM board_columns WHERE id = ? AND board_id = ?",
        (body.column_id, board_id),
    ).fetchone()
    if not col:
        conn.close()
        raise HTTPException(status_code=404, detail="Target column not found")

    old_column_id = card["column_id"]
    old_position = card["position"]

    # Remove from old position
    conn.execute(
        "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
        (old_column_id, old_position),
    )

    # Make room in new position
    conn.execute(
        "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ?",
        (body.column_id, body.position),
    )

    # Move the card
    conn.execute(
        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
        (body.column_id, body.position, card_id),
    )

    conn.commit()
    conn.close()
    return {"status": "ok"}
