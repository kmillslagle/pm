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
    dependencies: str = "[]"
    deliverable_type: str = ""
    key_references: str = ""


class CardUpdate(BaseModel):
    title: str | None = None
    details: str | None = None
    priority: str | None = None
    notes: str | None = None
    due_date: str | None = None
    subtasks: str | None = None
    dependencies: str | None = None
    deliverable_type: str | None = None
    key_references: str | None = None


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
    project_id: int | None = None


class BoardCreate(BaseModel):
    name: str
    columns: list[str] = []


class ProjectInfo(BaseModel):
    id: int
    name: str
    workstream_count: int = 0


class ProjectCreate(BaseModel):
    name: str


class WorkstreamDef(BaseModel):
    name: str
    columns: list[str]


class ProjectBoardCreate(BaseModel):
    workstreams: list[WorkstreamDef]


class WorkstreamResponse(BaseModel):
    id: int
    name: str
    columns: list[dict]
    cards: dict[str, dict]


class ProjectBoardResponse(BaseModel):
    project_id: int
    project_name: str
    workstreams: list[WorkstreamResponse]


class AiCardDef(BaseModel):
    title: str
    details: str = ""
    priority: str = "none"


class AiColumnDef(BaseModel):
    title: str
    cards: list[AiCardDef] = []


class AiBoardCreate(BaseModel):
    name: str
    columns: list[AiColumnDef]
    project_id: int | None = None


def create_columns(conn, board_id: int, column_names: list[str] | None = None) -> None:
    """Create columns for a board. Uses defaults if no names provided."""
    names = column_names if column_names else DEFAULT_COLUMNS
    conn.executemany(
        "INSERT INTO board_columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
        [(f"col-{secrets.token_hex(4)}", board_id, name, i) for i, name in enumerate(names)],
    )


def _safe_json_list(raw: str | None) -> list:
    """Parse a JSON string as a list, returning [] on any failure."""
    import json as _json
    if not raw:
        return []
    try:
        return _json.loads(raw)
    except Exception:
        return []


def _card_dict(card) -> dict:
    """Build a card dict from a DB row. Uses dict.get() so callers don't need every column in SELECT."""
    row = dict(card)
    return {
        "id": row["id"],
        "title": row["title"],
        "details": row.get("details", ""),
        "priority": row.get("priority", "none"),
        "notes": row.get("notes", ""),
        "dueDate": row.get("due_date"),
        "subtasks": _safe_json_list(row.get("subtasks")),
        "dependencies": _safe_json_list(row.get("dependencies")),
        "deliverableType": row.get("deliverable_type", ""),
        "keyReferences": row.get("key_references", ""),
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


@router.get("/projects")
def list_projects(request: Request) -> list[ProjectInfo]:
    username = get_current_user(request)
    conn = get_connection()
    rows = conn.execute(
        "SELECT p.id, p.name, COUNT(b.id) as workstream_count "
        "FROM projects p "
        "JOIN users u ON p.user_id = u.id "
        "LEFT JOIN boards b ON b.project_id = p.id "
        "WHERE u.username = ? "
        "GROUP BY p.id ORDER BY p.id",
        (username,),
    ).fetchall()
    conn.close()
    return [ProjectInfo(id=r["id"], name=r["name"], workstream_count=r["workstream_count"]) for r in rows]


@router.post("/projects")
def create_project(body: ProjectCreate, request: Request) -> ProjectInfo:
    username = get_current_user(request)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name required")
    conn = get_connection()
    user_row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    conn.execute("INSERT INTO projects (user_id, name) VALUES (?, ?)", (user_row["id"], body.name.strip()))
    project_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    return ProjectInfo(id=project_id, name=body.name.strip())


@router.delete("/projects/{project_id}")
def delete_project(project_id: int, request: Request) -> dict:
    username = get_current_user(request)
    conn = get_connection()
    proj = conn.execute(
        "SELECT p.id FROM projects p JOIN users u ON p.user_id = u.id "
        "WHERE p.id = ? AND u.username = ?", (project_id, username)
    ).fetchone()
    if not proj:
        conn.close()
        raise HTTPException(status_code=404, detail="Project not found")
    # Cascade: delete cards, columns, boards, then project
    board_ids = [r["id"] for r in conn.execute(
        "SELECT id FROM boards WHERE project_id = ?", (project_id,)
    ).fetchall()]
    for bid in board_ids:
        col_ids = [r["id"] for r in conn.execute(
            "SELECT id FROM board_columns WHERE board_id = ?", (bid,)
        ).fetchall()]
        for cid in col_ids:
            conn.execute("DELETE FROM cards WHERE column_id = ?", (cid,))
        conn.execute("DELETE FROM board_columns WHERE board_id = ?", (bid,))
        conn.execute("DELETE FROM chat_messages WHERE board_id = ?", (bid,))
    conn.execute("DELETE FROM boards WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    conn.commit()
    conn.close()
    return {"status": "ok"}


@router.get("/projects/{project_id}/workstreams")
def list_workstreams(project_id: int, request: Request) -> list[BoardInfo]:
    username = get_current_user(request)
    conn = get_connection()
    proj = conn.execute(
        "SELECT p.id FROM projects p JOIN users u ON p.user_id = u.id "
        "WHERE p.id = ? AND u.username = ?", (project_id, username)
    ).fetchone()
    if not proj:
        conn.close()
        raise HTTPException(status_code=404, detail="Project not found")
    rows = conn.execute(
        "SELECT id, name, project_id FROM boards WHERE project_id = ? ORDER BY id",
        (project_id,)
    ).fetchall()
    conn.close()
    return [BoardInfo(id=r["id"], name=r["name"], project_id=r["project_id"]) for r in rows]


@router.post("/projects/{project_id}/workstreams")
def create_workstream(project_id: int, body: BoardCreate, request: Request) -> BoardInfo:
    username = get_current_user(request)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name required")
    conn = get_connection()
    proj = conn.execute(
        "SELECT p.id FROM projects p JOIN users u ON p.user_id = u.id "
        "WHERE p.id = ? AND u.username = ?", (project_id, username)
    ).fetchone()
    if not proj:
        conn.close()
        raise HTTPException(status_code=404, detail="Project not found")
    user_row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    conn.execute(
        "INSERT INTO boards (user_id, name, project_id) VALUES (?, ?, ?)",
        (user_row["id"], body.name.strip(), project_id),
    )
    board_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    create_columns(conn, board_id, body.columns if body.columns else None)
    conn.commit()
    conn.close()
    return BoardInfo(id=board_id, name=body.name.strip(), project_id=project_id)


@router.get("/projects/{project_id}/board")
def get_project_board(project_id: int, request: Request) -> ProjectBoardResponse:
    username = get_current_user(request)
    conn = get_connection()
    proj = conn.execute(
        "SELECT p.id, p.name FROM projects p JOIN users u ON p.user_id = u.id "
        "WHERE p.id = ? AND u.username = ?", (project_id, username)
    ).fetchone()
    if not proj:
        conn.close()
        raise HTTPException(status_code=404, detail="Project not found")
    boards = conn.execute(
        "SELECT id, name FROM boards WHERE project_id = ? ORDER BY id",
        (project_id,),
    ).fetchall()
    workstreams = []
    for board in boards:
        cols = conn.execute(
            "SELECT id, title, position FROM board_columns WHERE board_id = ? ORDER BY position",
            (board["id"],),
        ).fetchall()
        columns = []
        cards = {}
        for col in cols:
            card_rows = conn.execute(
                "SELECT id, title, details, priority, notes, due_date, subtasks, dependencies, deliverable_type, key_references "
                "FROM cards WHERE column_id = ? ORDER BY position",
                (col["id"],),
            ).fetchall()
            card_ids = []
            for card in card_rows:
                cards[card["id"]] = _card_dict(card)
                card_ids.append(card["id"])
            columns.append({"id": col["id"], "title": col["title"], "cardIds": card_ids})
        workstreams.append(WorkstreamResponse(
            id=board["id"], name=board["name"], columns=columns, cards=cards
        ))
    conn.close()
    return ProjectBoardResponse(
        project_id=proj["id"], project_name=proj["name"], workstreams=workstreams
    )


@router.post("/projects/{project_id}/board")
def create_project_board(project_id: int, body: ProjectBoardCreate, request: Request) -> ProjectBoardResponse:
    username = get_current_user(request)
    conn = get_connection()
    proj = conn.execute(
        "SELECT p.id, p.name FROM projects p JOIN users u ON p.user_id = u.id "
        "WHERE p.id = ? AND u.username = ?", (project_id, username)
    ).fetchone()
    if not proj:
        conn.close()
        raise HTTPException(status_code=404, detail="Project not found")
    user_row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if not body.workstreams:
        conn.close()
        raise HTTPException(status_code=400, detail="At least one workstream required")
    for ws in body.workstreams:
        if not ws.name.strip():
            conn.close()
            raise HTTPException(status_code=400, detail="Workstream name required")
        if not ws.columns:
            conn.close()
            raise HTTPException(status_code=400, detail="At least one column required")
    for ws in body.workstreams:
        conn.execute(
            "INSERT INTO boards (user_id, name, project_id) VALUES (?, ?, ?)",
            (user_row["id"], ws.name.strip(), project_id),
        )
        board_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        create_columns(conn, board_id, ws.columns)
    conn.commit()
    conn.close()
    return get_project_board(project_id, request)


@router.get("/boards")
def list_boards(request: Request) -> list[BoardInfo]:
    username = get_current_user(request)
    conn = get_connection()
    rows = conn.execute(
        "SELECT b.id, b.name FROM boards b JOIN users u ON b.user_id = u.id "
        "WHERE u.username = ? AND b.project_id IS NULL ORDER BY b.id",
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
        "INSERT INTO boards (user_id, name, project_id) VALUES (?, ?, ?)",
        (user_row["id"], body.name.strip(), body.project_id),
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
                "INSERT INTO cards (id, column_id, title, details, position, priority, notes, due_date, subtasks, dependencies, deliverable_type, key_references) "
                "VALUES (?, ?, ?, ?, ?, ?, '', NULL, '[]', '[]', '', '')",
                (card_id, col_id, card.title, card.details, j, card.priority),
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
            "SELECT id, title, details, priority, notes, due_date, subtasks, dependencies, deliverable_type, key_references "
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


class ColumnCreate(BaseModel):
    title: str


@router.post("/boards/{board_id}/columns")
def add_column(board_id: int, body: ColumnCreate, request: Request) -> dict:
    username = get_current_user(request)
    _verify_board_owner(board_id, username)
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Column title required")
    conn = get_connection()
    max_pos = conn.execute(
        "SELECT COALESCE(MAX(position), -1) as max_pos FROM board_columns WHERE board_id = ?",
        (board_id,),
    ).fetchone()["max_pos"]
    col_id = f"col-{secrets.token_hex(4)}"
    conn.execute(
        "INSERT INTO board_columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
        (col_id, board_id, body.title.strip(), max_pos + 1),
    )
    conn.commit()
    conn.close()
    return {"id": col_id, "title": body.title.strip(), "cardIds": []}


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
        "INSERT INTO cards (id, column_id, title, details, position, priority, notes, due_date, subtasks, dependencies, deliverable_type, key_references) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (card_id, column_id, body.title, details, max_pos + 1,
         body.priority, body.notes, body.due_date, body.subtasks,
         body.dependencies, body.deliverable_type, body.key_references),
    )
    conn.commit()
    row = conn.execute(
        "SELECT id, title, details, priority, notes, due_date, subtasks, dependencies, deliverable_type, key_references FROM cards WHERE id = ?",
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
        "dependencies": body.dependencies if body.dependencies is not None else card["dependencies"],
        "deliverable_type": body.deliverable_type if body.deliverable_type is not None else card["deliverable_type"],
        "key_references": body.key_references if body.key_references is not None else card["key_references"],
    }
    conn.execute(
        "UPDATE cards SET title=?, details=?, priority=?, notes=?, due_date=?, subtasks=?, dependencies=?, deliverable_type=?, key_references=? WHERE id=?",
        (fields["title"], fields["details"], fields["priority"], fields["notes"],
         fields["due_date"], fields["subtasks"], fields["dependencies"],
         fields["deliverable_type"], fields["key_references"], card_id),
    )
    conn.commit()
    row = conn.execute(
        "SELECT id, title, details, priority, notes, due_date, subtasks, dependencies, deliverable_type, key_references FROM cards WHERE id = ?",
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

    if old_column_id == body.column_id:
        # Same-column reorder
        if old_position < body.position:
            conn.execute(
                "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ? AND position <= ?",
                (old_column_id, old_position, body.position),
            )
        elif old_position > body.position:
            conn.execute(
                "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ? AND position < ?",
                (old_column_id, body.position, old_position),
            )
        conn.execute(
            "UPDATE cards SET position = ? WHERE id = ?",
            (body.position, card_id),
        )
    else:
        # Cross-column move
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
