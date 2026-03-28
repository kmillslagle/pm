import json
import os
import re

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import get_connection

router = APIRouter(prefix="/api")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = "claude-opus-4-6"

class ChatRequest(BaseModel):
    message: str

class CardAction(BaseModel):
    action: str  # "create", "update", "move", "delete"
    card_id: str | None = None
    column_id: str | None = None
    title: str | None = None
    details: str | None = None
    position: int | None = None
    priority: str | None = None
    notes: str | None = None

class ChatResponse(BaseModel):
    reply: str
    board_updates: list[CardAction] = []
    create_board: dict | None = None


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
            "SELECT id, title, details, priority, notes, due_date, subtasks, dependencies, deliverable_type, key_references "
            "FROM cards WHERE column_id = ? ORDER BY position",
            (col["id"],)
        ).fetchall()
        card_ids = []
        for card in card_rows:
            row = dict(card)
            cards[card["id"]] = {
                "id": row["id"], "title": row["title"], "details": row["details"],
                "priority": row["priority"], "notes": row.get("notes", ""),
                "due_date": row.get("due_date"), "subtasks": row.get("subtasks", "[]"),
                "dependencies": row.get("dependencies", "[]"),
                "deliverable_type": row.get("deliverable_type", ""),
                "key_references": row.get("key_references", ""),
            }
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
                "INSERT INTO cards (id, column_id, title, details, position, priority, notes) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (card_id, update.column_id, update.title, update.details or "",
                 max_pos + 1, update.priority or "none", update.notes or "")
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
            if update.priority is not None:
                sets.append("priority = ?")
                params.append(update.priority)
            if update.notes is not None:
                sets.append("notes = ?")
                params.append(update.notes)
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


SYSTEM_PROMPT = """You are a project management assistant for Kanban Studio. You help users manage their Kanban boards and build new ones from project descriptions.

You will be given the current board state as JSON and the user's message.

## Responding

Always respond with valid JSON:
{
  "reply": "your message to the user",
  "board_updates": [],
  "create_board": null
}

## Managing the Current Board

Use board_updates to modify the current board. Available actions:
- {"action": "create", "column_id": "<column-id>", "title": "<card-title>", "details": "<card-details>", "priority": "<high|medium|low|none>", "notes": "<notes>"}
- {"action": "update", "card_id": "<card-id>", "title": "<new-title>", "details": "<new-details>", "priority": "<priority>", "notes": "<notes>"}
- {"action": "move", "card_id": "<card-id>", "column_id": "<target-column-id>", "position": <position>}
- {"action": "delete", "card_id": "<card-id>"}

## Building a New Board

When the user describes a project they want to plan as a Kanban board, you can generate an entire board. Set the create_board field:

{
  "reply": "your message",
  "board_updates": [],
  "create_board": {
    "name": "Board Name",
    "columns": [
      {"title": "Column Title", "cards": [{"title": "Card title", "details": "Card details"}, ...]},
      ...
    ]
  }
}

### Board Builder Guidelines

**Before generating:** If the user's request is short or vague, ask 1-2 clarifying questions first:
- What should the board be called?
- What are the main workstreams, phases, or categories?
- Any specific priorities or deadlines?
Do NOT ask questions if the user provides a detailed, elaborate description — go ahead and build.

**Column strategy:** Columns represent the major workstreams, phases, or categories of the project. Choose columns based on the user's description:
- If the user defines explicit workstreams or categories, use those as columns.
- If the user describes a phased project, use phases as columns (e.g., "Planning", "In Progress", "Review", "Done").
- If the project has a mix of concerns, group related work into 3-7 logical columns.
- Default to 5 columns if no structure is apparent.

**Card quality:** Each card should be:
- **Title:** Short and action-oriented (e.g., "Draft voting amendment" not "Voting amendment stuff").
- **Details:** 2-4 sentences defining the scope, deliverable, and any key references. Include dependencies on other cards when relevant.
- Generate as many cards as the project warrants. A complex project description with 20-30 distinct tasks should produce 20-30 cards, not a summary of 5.

**Prioritization:** Assign priorities based on:
- "high" — blocking work, foundational tasks, urgent deadlines
- "medium" — important but not blocking
- "low" — nice-to-have, future considerations, polish tasks
- "none" — default when priority is unclear

**Handling elaborate prompts:** When the user provides a long, detailed project description (multiple paragraphs, specific tasks, references to documents or regulations):
- Read the entire description carefully.
- Extract every distinct task or deliverable mentioned.
- Map each task to the appropriate column.
- Preserve specificity from the original description in card details (e.g., section numbers, entity names, legal references).
- Do not summarize or collapse multiple distinct tasks into one card.

Be concise in your reply text. Let the board speak for itself."""


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
        max_tokens=16384,
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    raw = response.content[0].text if response.content else "{}"
    parsed = _parse_ai_response(raw)

    reply = parsed.get("reply", "I could not generate a response.")
    board_updates_raw = parsed.get("board_updates", [])
    board_updates = [CardAction(**u) for u in board_updates_raw if isinstance(u, dict)]
    create_board_data = parsed.get("create_board", None)

    if board_updates:
        _apply_board_updates(board_id, board_updates)

    _save_message(board_id, "assistant", reply)

    return ChatResponse(reply=reply, board_updates=board_updates, create_board=create_board_data)


@router.get("/chat/history")
def chat_history(request: Request, board_id: int = Query(...)) -> list[dict]:
    username = get_current_user(request)
    _verify_board_owner(board_id, username)
    return _get_chat_history(board_id, limit=50)


class BuildRequest(BaseModel):
    message: str
    history: list[dict] = []


def _parse_ai_response(raw: str) -> dict:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r'\{[\s\S]*\}', raw)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return {"reply": raw}


@router.post("/boards/ai-build")
def ai_build(body: BuildRequest, request: Request) -> ChatResponse:
    """Stateless AI board builder — client manages conversation history."""
    get_current_user(request)  # verify auth only

    messages = [
        {"role": "user", "content": "Current board state:\n{}"},
        {"role": "assistant", "content": "I'm ready to help you design a new Kanban board. Describe your project and I'll build it for you."},
    ]
    messages.extend(body.history)
    messages.append({"role": "user", "content": body.message})

    if not ANTHROPIC_API_KEY:
        return ChatResponse(reply="AI is not configured. Set ANTHROPIC_API_KEY in your .env file.")

    import anthropic
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    response = client.messages.create(
        model=MODEL,
        max_tokens=16384,
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    raw = response.content[0].text if response.content else "{}"
    parsed = _parse_ai_response(raw)

    reply = parsed.get("reply", "I could not generate a response.")
    create_board_data = parsed.get("create_board", None)

    return ChatResponse(reply=reply, board_updates=[], create_board=create_board_data)
