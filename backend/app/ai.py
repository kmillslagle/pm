import json
import os

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import get_connection

router = APIRouter(prefix="/api")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-20250514"

class ChatRequest(BaseModel):
    message: str

class GenerateRequest(BaseModel):
    prompt: str
    board_name: str = ""

class CardAction(BaseModel):
    action: str  # "create", "update", "move", "delete"
    card_id: str | None = None
    column_id: str | None = None
    title: str | None = None
    details: str | None = None
    position: int | None = None

class ChatResponse(BaseModel):
    reply: str
    board_updates: list[CardAction] = []

class GenerateResponse(BaseModel):
    board_id: int
    board_name: str
    card_count: int
    column_names: list[str]


def _get_board_json(board_id: int) -> dict:
    conn = get_connection()
    cols = conn.execute(
        "SELECT id, title, position FROM board_columns WHERE board_id = ? ORDER BY position",
        (board_id,)
    ).fetchall()
    columns = []
    cards = {}
    for col in cols:
        card_rows = conn.execute(
            "SELECT id, title, details FROM cards WHERE column_id = ? ORDER BY position",
            (col["id"],)
        ).fetchall()
        card_ids = []
        for card in card_rows:
            cards[card["id"]] = {"id": card["id"], "title": card["title"], "details": card["details"]}
            card_ids.append(card["id"])
        columns.append({"id": col["id"], "title": col["title"], "cardIds": card_ids})
    conn.close()
    return {"columns": columns, "cards": cards}


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


def _get_chat_history(board_id: int, limit: int = 20) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT role, content FROM chat_messages WHERE board_id = ? ORDER BY id DESC LIMIT ?",
        (board_id, limit)
    ).fetchall()
    conn.close()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def _save_message(board_id: int, role: str, content: str) -> None:
    conn = get_connection()
    conn.execute(
        "INSERT INTO chat_messages (board_id, role, content) VALUES (?, ?, ?)",
        (board_id, role, content)
    )
    conn.commit()
    conn.close()


def _apply_board_updates(board_id: int, updates: list[CardAction]) -> None:
    import secrets
    conn = get_connection()
    for update in updates:
        if update.action == "create_board" and update.title:
            # Create a new board for this user
            column_names = [c.strip() for c in (update.details or "").split(",") if c.strip()]
            if not column_names:
                column_names = ["Backlog", "Discovery", "In Progress", "Review", "Done"]
            user_row = conn.execute(
                "SELECT u.id FROM users u JOIN boards b ON b.user_id = u.id WHERE b.id = ?",
                (board_id,)
            ).fetchone()
            if user_row:
                conn.execute("INSERT INTO boards (user_id, name) VALUES (?, ?)", (user_row["id"], update.title))
                new_board_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                for i, col_name in enumerate(column_names):
                    conn.execute(
                        "INSERT INTO board_columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
                        (f"col-{secrets.token_hex(4)}", new_board_id, col_name, i)
                    )
        elif update.action == "create" and update.column_id and update.title:
            max_pos = conn.execute(
                "SELECT COALESCE(MAX(position), -1) as p FROM cards WHERE column_id = ?",
                (update.column_id,)
            ).fetchone()["p"]
            card_id = f"card-{secrets.token_hex(4)}"
            conn.execute(
                "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)",
                (card_id, update.column_id, update.title, update.details or "", max_pos + 1)
            )
        elif update.action == "update" and update.card_id:
            sets = []
            params = []
            if update.title is not None:
                sets.append("title = ?")
                params.append(update.title)
            if update.details is not None:
                sets.append("details = ?")
                params.append(update.details)
            if sets:
                params.append(update.card_id)
                conn.execute(f"UPDATE cards SET {', '.join(sets)} WHERE id = ?", params)
        elif update.action == "move" and update.card_id and update.column_id is not None:
            card = conn.execute("SELECT column_id, position FROM cards WHERE id = ?", (update.card_id,)).fetchone()
            if card:
                conn.execute(
                    "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
                    (card["column_id"], card["position"])
                )
                pos = update.position if update.position is not None else 0
                conn.execute(
                    "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ?",
                    (update.column_id, pos)
                )
                conn.execute(
                    "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
                    (update.column_id, pos, update.card_id)
                )
        elif update.action == "delete" and update.card_id:
            conn.execute("DELETE FROM cards WHERE id = ?", (update.card_id,))
    conn.commit()
    conn.close()


SYSTEM_PROMPT = """You are a helpful project management assistant for a Kanban board app called Kanban Studio.

You will be given the current state of the user's Kanban board as JSON, along with their message.

You can respond with text AND optionally make changes to the board. When you want to make board changes, include them in the board_updates array.

Available board update actions:
- {"action": "create", "column_id": "<column-id>", "title": "<card-title>", "details": "<card-details>"}
- {"action": "update", "card_id": "<card-id>", "title": "<new-title>", "details": "<new-details>"}
- {"action": "move", "card_id": "<card-id>", "column_id": "<target-column-id>", "position": <position>}
- {"action": "delete", "card_id": "<card-id>"}

You can also create new projects/boards:
- {"action": "create_board", "title": "<board-name>", "details": "<comma-separated column names>"}

Always respond with valid JSON matching this schema:
{
  "reply": "your message to the user",
  "board_updates": [... optional array of actions]
}

Be concise and helpful. When the user asks you to create, move, or modify cards, do it via board_updates.
When the user asks to create a new project/board, use the create_board action.
When listing board contents, format them nicely with the column names and card titles."""


@router.post("/chat")
def chat(body: ChatRequest, request: Request, board_id: int = Query(...)) -> ChatResponse:
    username = get_current_user(request)
    _verify_board_owner(board_id, username)

    board_json = _get_board_json(board_id)
    history = _get_chat_history(board_id)

    _save_message(board_id, "user", body.message)

    messages = [
        {"role": "user", "content": f"Current board state:\n{json.dumps(board_json, indent=2)}"},
        {"role": "assistant", "content": "Got it. I have the current board state. How can I help?"},
    ]
    messages.extend(history)
    messages.append({"role": "user", "content": body.message})

    if not ANTHROPIC_API_KEY:
        reply = "AI is not configured. Set ANTHROPIC_API_KEY in your .env file."
        _save_message(board_id, "assistant", reply)
        return ChatResponse(reply=reply)

    import anthropic

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    raw = response.content[0].text if response.content else "{}"
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"reply": raw}

    reply = parsed.get("reply", "I could not generate a response.")
    board_updates_raw = parsed.get("board_updates", [])
    board_updates = [CardAction(**u) for u in board_updates_raw if isinstance(u, dict)]

    if board_updates:
        _apply_board_updates(board_id, board_updates)

    _save_message(board_id, "assistant", reply)

    return ChatResponse(reply=reply, board_updates=board_updates)


@router.get("/chat/history")
def chat_history(request: Request, board_id: int = Query(...)) -> list[dict]:
    username = get_current_user(request)
    _verify_board_owner(board_id, username)
    return _get_chat_history(board_id, limit=50)


GENERATE_SYSTEM_PROMPT = """You are a project management expert. Given a project description or prompt, generate a complete Kanban board structure with columns and cards.

You MUST respond with valid JSON matching this exact schema:
{
  "board_name": "Short project name (if not provided by the user)",
  "columns": ["Column 1 Name", "Column 2 Name", ...],
  "cards": [
    {
      "column": "Column 1 Name",
      "title": "Short action-oriented card title",
      "details": "2-4 sentence description of scope, deliverables, and any dependencies or key references."
    },
    ...
  ]
}

Guidelines:
- Derive column names from workstreams, phases, or categories described in the prompt. If the prompt specifies workstreams or categories, use those as columns.
- If no clear structure is given, use sensible project phases (e.g. "Planning", "In Progress", "Review", "Done").
- Card titles should be short and action-oriented (e.g. "Draft Dual-Block Voting Amendment", "Analyze IRC §67(e) Compliance").
- Card details should be 2-4 sentences covering: scope, deliverable type, key references (statutes, document sections, etc.), and dependencies on other cards if any.
- Generate ALL cards requested. Do not skip or summarize. If the prompt asks for 30 cards, generate all 30.
- Each card's "column" field must exactly match one of the column names in the "columns" array.
- Respond ONLY with the JSON object. No markdown, no commentary, no code fences."""


@router.post("/boards/generate")
def generate_board(body: GenerateRequest, request: Request) -> GenerateResponse:
    import secrets

    username = get_current_user(request)

    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="AI is not configured. Set ANTHROPIC_API_KEY.")

    import anthropic

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    response = client.messages.create(
        model=MODEL,
        max_tokens=16384,
        system=GENERATE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": body.prompt}],
    )

    raw = response.content[0].text if response.content else "{}"
    # Strip markdown code fences if present
    stripped = raw.strip()
    if stripped.startswith("```"):
        lines = stripped.split("\n")
        # Remove first line (```json or ```) and last line (```)
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines)

    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI returned invalid JSON. Please try again.")

    board_name = body.board_name.strip() if body.board_name.strip() else parsed.get("board_name", "AI Generated Board")
    column_names = parsed.get("columns", [])
    cards_data = parsed.get("cards", [])

    if not column_names:
        raise HTTPException(status_code=500, detail="AI did not generate any columns. Please try again.")

    # Create the board
    conn = get_connection()
    user_row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if not user_row:
        conn.close()
        raise HTTPException(status_code=401, detail="User not found")

    conn.execute("INSERT INTO boards (user_id, name) VALUES (?, ?)", (user_row["id"], board_name))
    board_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

    # Create columns and build a name->id mapping
    col_map = {}
    for i, col_name in enumerate(column_names):
        col_id = f"col-{secrets.token_hex(4)}"
        conn.execute(
            "INSERT INTO board_columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
            (col_id, board_id, col_name, i),
        )
        col_map[col_name] = col_id

    # Create cards
    card_count = 0
    # Track position per column
    col_positions: dict[str, int] = {col_name: 0 for col_name in column_names}

    for card in cards_data:
        if not isinstance(card, dict):
            continue
        col_name = card.get("column", "")
        title = card.get("title", "")
        details = card.get("details", "")
        if not title:
            continue

        # Find matching column (exact match first, then case-insensitive)
        col_id = col_map.get(col_name)
        if not col_id:
            for name, cid in col_map.items():
                if name.lower() == col_name.lower():
                    col_id = cid
                    col_name = name
                    break
        if not col_id:
            # Put in first column as fallback
            first_col = column_names[0]
            col_id = col_map[first_col]
            col_name = first_col

        pos = col_positions.get(col_name, 0)
        card_id = f"card-{secrets.token_hex(4)}"
        conn.execute(
            "INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)",
            (card_id, col_id, title, details, pos),
        )
        col_positions[col_name] = pos + 1
        card_count += 1

    conn.commit()
    conn.close()

    return GenerateResponse(
        board_id=board_id,
        board_name=board_name,
        card_count=card_count,
        column_names=column_names,
    )
