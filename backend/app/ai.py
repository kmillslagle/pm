import json
import os
import re
import secrets

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.auth import get_current_user
from app.board import create_columns
from app.database import get_connection

router = APIRouter(prefix="/api")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = "claude-opus-4-6"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str


class BoardAction(BaseModel):
    action: str  # create_card, update_card, move_card, delete_card, create_workstream, add_column, rename_column
    workstream_name: str | None = None
    workstream_id: int | None = None
    columns: list[str] | None = None
    column_id: str | None = None
    column_title: str | None = None
    card_id: str | None = None
    title: str | None = None
    details: str | None = None
    priority: str | None = None
    notes: str | None = None
    due_date: str | None = None
    subtasks: str | None = None
    dependencies: str | None = None
    deliverable_type: str | None = None
    key_references: str | None = None
    position: int | None = None


class ChatResponse(BaseModel):
    reply: str
    board_updates: list[BoardAction] = []
    create_board: dict | None = None
    plan: str | None = None
    plan_workstream: str | None = None


class BuildRequest(BaseModel):
    message: str
    history: list[dict] = []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_project_json(project_id: int) -> dict:
    """Return the full project state as JSON for AI context."""
    conn = get_connection()
    proj = conn.execute("SELECT id, name FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not proj:
        conn.close()
        return {}
    boards = conn.execute(
        "SELECT id, name FROM boards WHERE project_id = ? ORDER BY id", (project_id,)
    ).fetchall()
    workstreams = []
    for board in boards:
        cols = conn.execute(
            "SELECT id, title, position FROM board_columns WHERE board_id = ? ORDER BY position",
            (board["id"],)
        ).fetchall()
        columns = []
        cards = {}
        for col in cols:
            card_rows = conn.execute(
                "SELECT id, title, details, priority, notes, due_date, subtasks, "
                "dependencies, deliverable_type, key_references "
                "FROM cards WHERE column_id = ? ORDER BY position",
                (col["id"],)
            ).fetchall()
            card_ids = []
            for card in card_rows:
                row = dict(card)
                cards[card["id"]] = {
                    "id": row["id"], "title": row["title"],
                    "details": row.get("details", ""),
                    "priority": row.get("priority", "none"),
                    "notes": row.get("notes", ""),
                    "due_date": row.get("due_date"),
                    "subtasks": row.get("subtasks", "[]"),
                    "dependencies": row.get("dependencies", "[]"),
                    "deliverable_type": row.get("deliverable_type", ""),
                    "key_references": row.get("key_references", ""),
                }
                card_ids.append(card["id"])
            columns.append({"id": col["id"], "title": col["title"], "cardIds": card_ids})
        workstreams.append({
            "id": board["id"], "name": board["name"],
            "columns": columns, "cards": cards,
        })
    conn.close()
    return {"project_name": proj["name"], "project_id": proj["id"], "workstreams": workstreams}


def _verify_project_owner(project_id: int, username: str) -> None:
    conn = get_connection()
    row = conn.execute(
        "SELECT p.id FROM projects p JOIN users u ON p.user_id = u.id "
        "WHERE p.id = ? AND u.username = ?",
        (project_id, username),
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")


def _get_project_chat_history(project_id: int, limit: int = 20) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT role, content FROM chat_messages WHERE project_id = ? ORDER BY id DESC LIMIT ?",
        (project_id, limit)
    ).fetchall()
    conn.close()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def _save_project_message(project_id: int, role: str, content: str) -> None:
    conn = get_connection()
    # board_id is NOT NULL with FK — use the first board in the project.
    # For new projects with no boards yet, temporarily disable FK checks so we can store board_id=0.
    board = conn.execute(
        "SELECT id FROM boards WHERE project_id = ? ORDER BY id LIMIT 1", (project_id,)
    ).fetchone()
    board_id = board["id"] if board else 0
    if board_id == 0:
        conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute(
        "INSERT INTO chat_messages (board_id, project_id, role, content) VALUES (?, ?, ?, ?)",
        (board_id, project_id, role, content)
    )
    if board_id == 0:
        conn.execute("PRAGMA foreign_keys=ON")
    conn.commit()
    conn.close()


def _apply_project_updates(project_id: int, username: str, updates: list[BoardAction]) -> None:
    """Apply a list of AI-generated board actions to the project."""
    conn = get_connection()
    user_row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    user_id = user_row["id"]

    # Track workstreams created in this batch so the AI can reference them by name
    created_workstreams: dict[str, int] = {}

    for action in updates:
        act = action.action

        if act == "create_workstream" and action.workstream_name:
            name = action.workstream_name.strip()
            col_names = action.columns if action.columns else ["To Do", "In Progress", "Done"]
            conn.execute(
                "INSERT INTO boards (user_id, name, project_id) VALUES (?, ?, ?)",
                (user_id, name, project_id),
            )
            board_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            create_columns(conn, board_id, col_names)
            created_workstreams[name] = board_id

        elif act == "add_column" and action.column_title:
            ws_id = action.workstream_id
            if ws_id is None and action.workstream_name:
                ws_id = created_workstreams.get(action.workstream_name)
            if ws_id is None:
                continue
            max_pos = conn.execute(
                "SELECT COALESCE(MAX(position), -1) as p FROM board_columns WHERE board_id = ?",
                (ws_id,)
            ).fetchone()["p"]
            col_id = f"col-{secrets.token_hex(4)}"
            conn.execute(
                "INSERT INTO board_columns (id, board_id, title, position) VALUES (?, ?, ?, ?)",
                (col_id, ws_id, action.column_title.strip(), max_pos + 1),
            )

        elif act == "rename_column" and action.column_id and action.column_title:
            conn.execute(
                "UPDATE board_columns SET title = ? WHERE id = ?",
                (action.column_title.strip(), action.column_id),
            )

        elif act == "create_card" and action.title:
            # Resolve column_id: either directly provided, or via workstream_name + column_title
            col_id = action.column_id
            if not col_id and action.workstream_name and action.column_title:
                ws_id = action.workstream_id
                if ws_id is None:
                    ws_id = created_workstreams.get(action.workstream_name)
                if ws_id is None:
                    # Try to find by name in existing boards
                    ws_row = conn.execute(
                        "SELECT id FROM boards WHERE project_id = ? AND name = ?",
                        (project_id, action.workstream_name)
                    ).fetchone()
                    if ws_row:
                        ws_id = ws_row["id"]
                if ws_id is not None:
                    col_row = conn.execute(
                        "SELECT id FROM board_columns WHERE board_id = ? AND title = ?",
                        (ws_id, action.column_title)
                    ).fetchone()
                    if col_row:
                        col_id = col_row["id"]
            if not col_id:
                continue
            max_pos = conn.execute(
                "SELECT COALESCE(MAX(position), -1) as p FROM cards WHERE column_id = ?",
                (col_id,)
            ).fetchone()["p"]
            card_id = f"card-{secrets.token_hex(4)}"
            conn.execute(
                "INSERT INTO cards (id, column_id, title, details, position, priority, "
                "notes, due_date, subtasks, dependencies, deliverable_type, key_references) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    card_id, col_id, action.title,
                    action.details or "",
                    max_pos + 1,
                    action.priority or "none",
                    action.notes or "Add notes here.",
                    action.due_date,
                    action.subtasks or "[]",
                    action.dependencies or "[]",
                    action.deliverable_type or "",
                    action.key_references or "Add references here.",
                ),
            )

        elif act == "update_card" and action.card_id:
            sets = []
            params = []
            for field, col_name in [
                ("title", "title"), ("details", "details"), ("priority", "priority"),
                ("notes", "notes"), ("due_date", "due_date"), ("subtasks", "subtasks"),
                ("dependencies", "dependencies"), ("deliverable_type", "deliverable_type"),
                ("key_references", "key_references"),
            ]:
                val = getattr(action, field, None)
                if val is not None:
                    sets.append(f"{col_name} = ?")
                    params.append(val)
            if sets:
                params.append(action.card_id)
                conn.execute(f"UPDATE cards SET {', '.join(sets)} WHERE id = ?", params)

        elif act == "move_card" and action.card_id and action.column_id is not None:
            card = conn.execute(
                "SELECT column_id, position FROM cards WHERE id = ?", (action.card_id,)
            ).fetchone()
            if card:
                old_col = card["column_id"]
                old_pos = card["position"]
                new_pos = action.position if action.position is not None else 0
                if old_col == action.column_id:
                    if old_pos < new_pos:
                        conn.execute(
                            "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ? AND position <= ?",
                            (old_col, old_pos, new_pos),
                        )
                    elif old_pos > new_pos:
                        conn.execute(
                            "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ? AND position < ?",
                            (old_col, new_pos, old_pos),
                        )
                    conn.execute("UPDATE cards SET position = ? WHERE id = ?", (new_pos, action.card_id))
                else:
                    conn.execute(
                        "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
                        (old_col, old_pos),
                    )
                    conn.execute(
                        "UPDATE cards SET position = position + 1 WHERE column_id = ? AND position >= ?",
                        (action.column_id, new_pos),
                    )
                    conn.execute(
                        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
                        (action.column_id, new_pos, action.card_id),
                    )

        elif act == "delete_card" and action.card_id:
            conn.execute("DELETE FROM cards WHERE id = ?", (action.card_id,))

    conn.commit()
    conn.close()


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


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a project management assistant for Kanban Studio. You help users manage their Kanban projects which contain workstreams, columns, and cards.

## Data Model

A **project** contains one or more **workstreams**. Each workstream has its own **columns**, and each column contains **cards**. The project JSON you receive shows all workstreams with their IDs, columns, and cards.

## Response Format

Always respond with valid JSON:
{
  "reply": "your message to the user",
  "board_updates": [],
  "create_board": null,
  "plan": null,
  "plan_workstream": null
}

- **reply**: Your message to the user (always required).
- **board_updates**: Array of actions to execute (empty when presenting a plan).
- **create_board**: Used to create an entirely new board/project structure (rarely used — prefer board_updates for existing projects).
- **plan**: A markdown description of what you intend to do. When set, board_updates MUST be empty.
- **plan_workstream**: When executing a plan workstream-by-workstream, set this to the workstream name being built in this batch.

## Plan-First Workflow

For any request that would create or modify more than 3 items, involve structural changes (workstreams, columns), or build from a long prompt:

1. **Plan phase**: Respond with a `plan` field containing a clear markdown summary organized by workstream. Include the workstream names, column names, and card titles you intend to create/modify. Do NOT include board_updates yet. Ask the user to approve or revise.

2. **Execution phase**: When the user approves (says yes, ok, go ahead, approved, looks good, etc.), execute workstream-by-workstream:
   - Set `plan_workstream` to the workstream name being built.
   - Include the board_updates for that workstream only.
   - After completing each workstream, ask: "Completed [Workstream Name]. Ready to proceed with [Next Workstream]?"
   - Continue until all workstreams are done.

3. **Revision**: If the user asks to change the plan, update your plan and present it again for approval.

For small requests (1-3 card edits, a single rename, etc.), skip the plan and execute directly.

## Available Actions (board_updates)

### Workstream actions
- `{"action": "create_workstream", "workstream_name": "Name", "columns": ["Col 1", "Col 2", "Col 3"]}`

### Column actions
- `{"action": "add_column", "workstream_id": <id>, "column_title": "New Column"}`
- `{"action": "rename_column", "column_id": "<col-id>", "column_title": "New Title"}`

### Card actions
For NEW workstreams (just created in the same batch), use `workstream_name` + `column_title` instead of `column_id`:
- `{"action": "create_card", "workstream_name": "WS Name", "column_title": "Column Name", "title": "Card Title", "details": "Description...", "priority": "high|medium|low|none", "notes": "...", "due_date": "YYYY-MM-DD", "subtasks": "[{\\"id\\":\\"st-1\\",\\"title\\":\\"Step 1\\",\\"done\\":false}]", "dependencies": "[\\"Other Card Title\\"]", "deliverable_type": "Memo|Draft Amendment|Agreement|Analysis|Checklist|Policy|Template", "key_references": "..."}`

For EXISTING workstreams (already in the project state), use the real `column_id`:
- `{"action": "create_card", "column_id": "<col-id>", "title": "Card Title", ...}`
- `{"action": "update_card", "card_id": "<card-id>", "title": "...", "details": "...", ...}`
  Only include fields you want to change.
- `{"action": "move_card", "card_id": "<card-id>", "column_id": "<target-col-id>", "position": 0}`
- `{"action": "delete_card", "card_id": "<card-id>"}`

## Card Field Rules

When creating cards, ALWAYS populate ALL fields with useful content:
- **title**: Short, action-oriented (e.g., "Draft Dual-Block Voting Amendment").
- **details**: 2-4 sentences defining scope and deliverable. Improve the user's wording for clarity.
- **priority**: Infer from context. Blocking/foundational/urgent = "high", important = "medium", nice-to-have = "low", unclear = "none".
- **notes**: If the user provides notes, use them. Otherwise set to "Add notes here."
- **due_date**: Set if the user mentions deadlines, otherwise omit.
- **subtasks**: Break multi-step cards into subtasks as a JSON array: [{"id":"st-1","title":"Step name","done":false}].
- **dependencies**: Reference titles of other cards that must be completed first as a JSON array: ["Card Title 1"].
- **deliverable_type**: Infer from context — drafting work = "Draft Amendment", research = "Analysis" or "Memo", setup = "Checklist", agreements = "Agreement", standards = "Policy", reusable formats = "Template". If unclear, leave empty.
- **key_references**: Relevant document sections, statutes, regulations, or standards. If none, set to "Add references here."

## Skills

### Skill: Board Builder
**When**: User wants to create a new board, workstreams, or populate a project from a description.
**Steps**: If the prompt is short/vague, ask 1-2 clarifying questions. Ask if user wants to add to the current project or create a new one. Then develop a plan, get approval, and execute workstream-by-workstream.
**Quality**: Generate as many cards as the project warrants. Don't summarize 20 tasks into 5. Preserve specificity from the user's description.

### Skill: Board Quality Assessment
**When**: User asks to assess, review, audit, or improve their board.
**Steps**: Analyze the current project state for:
- Cards missing details, subtasks, dependencies, or deliverable types
- Vague or unclear card titles
- Missing priorities on important work
- Columns with too many cards (bottlenecks) or empty columns
- Missing workstreams the project might need
- Cards that should have dependencies but don't
Present findings as a plan with specific improvements, then implement on approval.

### Skill: Card Enrichment
**When**: User asks to fill in, improve, or flesh out cards.
**Steps**: Identify cards with gaps (missing notes, subtasks, dependencies, deliverable type, key references). Propose enrichments as a plan, then implement on approval.

### Skill: Workstream Management
**When**: User wants to add, reorganize, or modify workstreams and columns.
**Steps**: Understand the desired structure, propose changes as a plan, implement on approval.

## Proactive Suggestions

After completing any action, suggest what the user might want to do next. Examples:
- "Would you like to update a Board, Workstream, or Card?"
- "I notice several cards are missing dependencies — would you like me to suggest some?"
- "Would you like me to assess the board quality and suggest improvements?"

## Building New Projects

When the user provides a long, detailed prompt to build a board:
1. If the project is empty (no workstreams), skip asking "add to current or create new" — just build directly into this project.
2. Read the entire description carefully. Extract every distinct task.
3. Organize tasks into logical workstreams and columns.
4. Present a plan with workstream names, column names, and card titles.
5. On approval, IMMEDIATELY execute by sending board_updates with create_workstream and create_card actions. Do NOT ask more questions — just build it.

**CRITICAL**: When the user says "approved", "yes", "go ahead", "looks good", "build it", or similar approval words, you MUST respond with board_updates containing the actual actions. Do NOT respond with just text or ask more questions. Execute the plan immediately.

**For empty projects**: If you receive a detailed description and the project has zero workstreams, present a brief plan and then when approved, build the FIRST workstream immediately in that same response (include board_updates). Then ask about the next workstream.

Be concise in your reply text. Let the board speak for itself."""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/chat/project")
def project_chat(body: ChatRequest, request: Request, project_id: int = Query(...)) -> ChatResponse:
    """Project-scoped AI chat with full project context."""
    username = get_current_user(request)
    _verify_project_owner(project_id, username)

    project_json = _get_project_json(project_id)
    history = _get_project_chat_history(project_id)

    _save_project_message(project_id, "user", body.message)

    messages = [
        {"role": "user", "content": f"Current project state:\n{json.dumps(project_json, indent=2)}"},
        {"role": "assistant", "content": "Got it. I have the full project state with all workstreams, columns, and cards. How can I help?"},
    ]
    messages.extend(history)
    messages.append({"role": "user", "content": body.message})

    if not ANTHROPIC_API_KEY:
        reply = "AI is not configured. Set ANTHROPIC_API_KEY in your .env file."
        _save_project_message(project_id, "assistant", reply)
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
    board_updates = [BoardAction(**u) for u in board_updates_raw if isinstance(u, dict)]
    create_board_data = parsed.get("create_board", None)
    plan = parsed.get("plan", None)
    plan_workstream = parsed.get("plan_workstream", None)

    if board_updates:
        _apply_project_updates(project_id, username, board_updates)

    _save_project_message(project_id, "assistant", reply)

    return ChatResponse(
        reply=reply,
        board_updates=board_updates,
        create_board=create_board_data,
        plan=plan,
        plan_workstream=plan_workstream,
    )


@router.get("/chat/project/history")
def project_chat_history(request: Request, project_id: int = Query(...)) -> list[dict]:
    username = get_current_user(request)
    _verify_project_owner(project_id, username)
    return _get_project_chat_history(project_id, limit=50)


# Keep legacy board-scoped endpoints for backward compat (not used by frontend)
@router.post("/chat")
def chat(body: ChatRequest, request: Request, board_id: int = Query(...)) -> ChatResponse:
    username = get_current_user(request)
    from app.board import _verify_board_owner
    _verify_board_owner(board_id, username)
    return ChatResponse(reply="This endpoint is deprecated. Use /api/chat/project instead.")


@router.get("/chat/history")
def chat_history(request: Request, board_id: int = Query(...)) -> list[dict]:
    username = get_current_user(request)
    from app.board import _verify_board_owner
    _verify_board_owner(board_id, username)
    return []


@router.post("/boards/ai-build")
def ai_build(body: BuildRequest, request: Request) -> ChatResponse:
    """Stateless AI board builder — client manages conversation history."""
    get_current_user(request)

    messages = [
        {"role": "user", "content": "Current project state:\n{}"},
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
