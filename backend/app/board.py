import secrets

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import get_connection

router = APIRouter(prefix="/api")

DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"]


class CardCreate(BaseModel):
    title: str
    details: str = ""
    priority: str = "none"
    notes: str = ""
    due_date: str | None = None
    subtasks: str = "[]"


class CardUpdate(BaseModel):
    title: str | None = None
    details: str | None = None
    priority: str | None = None
    notes: str | None = None
    due_date: str | None = None
    subtasks: str | None = None


class ColumnUpdate(BaseModel):
    title: str


class CardMove(BaseModel):
    column_id: str
    position: int


class BoardResponse(BaseModel):
    columns: list[dict]
    cards: dict[str, dict]


class BoardInfo(BaseModel):
    id: int
    name: str


class BoardCreate(BaseModel):
    name: str
    columns: list[str] = []


class AiCardDef(BaseModel):
    title: str
    details: str = ""


class AiColumnDef(BaseModel):
    title: str
    cards: list[AiCardDef] = []


class AiBoardCreate(BaseModel):
    name: str
    columns: list[AiColumnDef]


def create_columns(conn, board_id: int, column_names: list[str] | None = None) -> None:
    """Create columns for a board. Uses defaults if no names provided."""
    names = column_names if column_names else DEFAULT_COLUMNS
    conn.executemany(
        "INSERT INTO board_columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
        [(f"col-{secrets.token_hex(4)}", board_id, name, i) for i, name in enumerate(names)],
    )


def _card_dict(card) -> dict:
    """Build a card dict from a DB row including rich fields."""
    return {
        "id": card["id"],
        "title": card["title"],
        "details": card["details"],
        "priority": card["priority"],
        "notes": card["notes"],
        "due_date": card["due_date"],
        "subtasks": card["subtasks"],
    }


def _verify_board_owner(board_id: int, username: str) -> None:
    conn = get_connection()
    row = conn.execute(
        "SELECT b.id FROM boards b JOIN users u ON b.user_id = u.id "
        "WHERE b.id = ? AND u.username = ?",
        (board_id, username),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Board not found")


@router.get("/boards")
def list_boards(request: Request) -> list[BoardInfo]:
    username = get_current_user(request)
    conn = get_connection()
    rows = conn.execute(
        "SELECT b.id, b.name FROM boards b JOIN users u ON b.user_id = u.id "
        "WHERE u.username = ? ORDER BY b.id",
        (username,),
    ).fetchall()
    conn.close()
    return [BoardInfo(id=row["id"], name=row["name"]) for row in rows]


@router.post("/boards")
def create_board(body: BoardCreate, request: Request) -> BoardInfo:
    username = get_current_user(request)
    if len(body.name.strip()) < 1:
        raise HTTPException(status_code=400, detail="Board name is required")
    conn = get_connection()
    user_row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    conn.execute(
        "INSERT INTO boards (user_id, name) VALUES (?, ?)",
        (user_row["id"], body.name.strip()),
    )
    board_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    column_names = body.columns if body.columns else None
    create_columns(conn, board_id, column_names)
    conn.commit()
    conn.close()
    return BoardInfo(id=board_id, name=body.name.strip())


@router.post("/boards/from-ai")
def create_board_from_ai(body: AiBoardCreate, request: Request) -> BoardInfo:
    username = get_current_user(request)
    if len(body.name.strip()) < 1:
        raise HTTPException(status_code=400, detail="Board name is required")
    conn = get_connection()
    user_row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    conn.execute(
        "INSERT INTO boards (user_id, name) VALUES (?, ?)",
        (user_row["id"], body.name.strip()),
    )
    board_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for i, col in enumerate(body.columns):
        col_id = f"col-{secrets.token_hex(4)}"
        conn.execute(
            "INSERT INTO board_columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (col_id, board_id, col.title, i),
        )
        for j, card in enumerate(col.cards):
            card_id = f"card-{secrets.token_hex(4)}"
            conn.execute(
                "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)",
                (card_id, col_id, card.title, card.details, j),
            )
    conn.commit()
    conn.close()
    return BoardInfo(id=board_id, name=body.name.strip())


@router.get("/boards/{board_id}")
def get_board(board_id: int, request: Request) -> BoardResponse:
    username = get_current_user(request)
    _verify_board_owner(board_id, username)
    conn = get_connection()

    cols = conn.execute(
        "SELECT id, title, position FROM board_columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ).fetchall()

    columns = []
    cards = {}
    for col in cols:
        card_rows = conn.execute(
            "SELECT id, title, details, priority, notes, due_date, subtasks "
            "FROM cards WHERE column_id = ? ORDER BY position",
            (col["id"],),
        ).fetchall()
        card_ids = []
        for card in card_rows:
            cards[card["id"]] = _card_dict(card)
            card_ids.append(card["id"])
        columns.append({"id": col["id"], "title": col["title"], "cardIds": card_ids})

    conn.close()
    return BoardResponse(columns=columns, cards=cards)


# Keep the old endpoint for backwards compatibility during transition
@router.get("/board")
def get_board_legacy(request: Request) -> BoardResponse:
    username = get_current_user(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT b.id FROM boards b JOIN users u ON b.user_id = u.id WHERE u.username = ?",
        (username,),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Board not found")
    return get_board(row["id"], request)


@router.put("/columns/{column_id}")
def update_column(column_id: str, body: ColumnUpdate, request: Request) -> dict:
    username = get_current_user(request)
    conn = get_connection()
    row = conn.execute(
        "SELECT bc.id FROM board_columns bc JOIN boards b ON bc.board_id = b.id "
        "JOIN users u ON b.user_id = u.id WHERE bc.id = ? AND u.username = ?",
        (column_id, username),
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Column not found")
    conn.execute("UPDATE board_columns SET title = ? WHERE id = ?", (body.title, column_id))
    conn.commit()
    conn.close()
    return {"status": "ok"}


@router.post("/columns/{column_id}/cards")
def create_card(column_id: str, body: CardCreate, request: Request) -> dict:
    username = get_current_user(request)
    conn = get_connection()

    col = conn.execute(
        "SELECT bc.id FROM board_columns bc JOIN boards b ON bc.board_id = b.id "
        "JOIN users u ON b.user_id = u.id WHERE bc.id = ? AND u.username = ?",
        (column_id, username),
    ).fetchone()
    if not col:
        conn.close()
        raise HTTPException(status_code=404, detail="Column not found")

    max_pos = conn.execute(
        "SELECT COALESCE(MAX(position), -1) as max_pos FROM cards WHERE column_id = ?",
        (column_id,),
    ).fetchone()["max_pos"]

    card_id = f"card-{secrets.token_hex(4)}"
    details = body.details or "No details yet."
    conn.execute(
        "INSERT INTO cards (id, column_id, title, details, position, priority, notes, due_date, subtasks) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (card_id, column_id, body.title, details, max_pos + 1,
         body.priority, body.notes, body.due_date, body.subtasks),
    )
    conn.commit()
    row = conn.execute(
        "SELECT id, title, details, priority, notes, due_date, subtasks FROM cards WHERE id = ?",
        (card_id,),
    ).fetchone()
    conn.close()
    return _card_dict(row)


@router.put("/cards/{card_id}")
def update_card(card_id: str, body: CardUpdate, request: Request) -> dict:
    username = get_current_user(request)
    conn = get_connection()
    card = conn.execute(
        "SELECT c.* FROM cards c JOIN board_columns bc ON c.column_id = bc.id "
        "JOIN boards b ON bc.board_id = b.id JOIN users u ON b.user_id = u.id "
        "WHERE c.id = ? AND u.username = ?",
        (card_id, username),
    ).fetchone()
    if not card:
        conn.close()
        raise HTTPException(status_code=404, detail="Card not found")

    fields = {
        "title": body.title if body.title is not None else card["title"],
        "details": body.details if body.details is not None else card["details"],
        "priority": body.priority if body.priority is not None else card["priority"],
        "notes": body.notes if body.notes is not None else card["notes"],
        "due_date": body.due_date if body.due_date is not None else card["due_date"],
        "subtasks": body.subtasks if body.subtasks is not None else card["subtasks"],
    }
    conn.execute(
        "UPDATE cards SET title=?, details=?, priority=?, notes=?, due_date=?, subtasks=? WHERE id=?",
        (fields["title"], fields["details"], fields["priority"], fields["notes"],
         fields["due_date"], fields["subtasks"], card_id),
    )
    conn.commit()
    row = conn.execute(
        "SELECT id, title, details, priority, notes, due_date, subtasks FROM cards WHERE id = ?",
        (card_id,),
    ).fetchone()
    conn.close()
    return _card_dict(row)


@router.delete("/cards/{card_id}")
def delete_card(card_id: str, request: Request) -> dict:
    username = get_current_user(request)
    conn = get_connection()
    card = conn.execute(
        "SELECT c.id FROM cards c JOIN board_columns bc ON c.column_id = bc.id "
        "JOIN boards b ON bc.board_id = b.id JOIN users u ON b.user_id = u.id "
        "WHERE c.id = ? AND u.username = ?",
        (card_id, username),
    ).fetchone()
    if not card:
        conn.close()
        raise HTTPException(status_code=404, detail="Card not found")
    conn.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}


@router.put("/cards/{card_id}/move")
def move_card(card_id: str, body: CardMove, request: Request) -> dict:
    username = get_current_user(request)
    conn = get_connection()

    card = conn.execute(
        "SELECT c.* FROM cards c JOIN board_columns bc ON c.column_id = bc.id "
        "JOIN boards b ON bc.board_id = b.id JOIN users u ON b.user_id = u.id "
        "WHERE c.id = ? AND u.username = ?",
        (card_id, username),
    ).fetchone()
    if not card:
        conn.close()
        raise HTTPException(status_code=404, detail="Card not found")

    col = conn.execute(
        "SELECT bc.id FROM board_columns bc JOIN boards b ON bc.board_id = b.id "
        "JOIN users u ON b.user_id = u.id WHERE bc.id = ? AND u.username = ?",
        (body.column_id, username),
    ).fetchone()
    if not col:
        conn.close()
        raise HTTPException(status_code=404, detail="Target column not found")

    old_column_id = card["column_id"]
    old_position = card["position"]

    conn.execute(
        "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
        (old_column_id, old_position),
    )
    conn.execute(
        "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ?",
        (body.column_id, body.position),
    )
    conn.execute(
        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
        (body.column_id, body.position, card_id),
    )

    conn.commit()
    conn.close()
    return {"status": "ok"}
