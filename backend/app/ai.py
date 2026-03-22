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
        if update.action == "create" and update.column_id and update.title:
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

Always respond with valid JSON matching this schema:
{
  "reply": "your message to the user",
  "board_updates": [... optional array of actions]
}

Be concise and helpful. When the user asks you to create, move, or modify cards, do it via board_updates."""


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
