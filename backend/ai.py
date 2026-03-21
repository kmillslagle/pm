import json
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI
from sqlalchemy.orm import Session as DbSession

from .database import get_db
from .models import User
from .auth import get_current_user

router = APIRouter()


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[Message]
    board: dict


SYSTEM_PROMPT = """You are an AI assistant for a Kanban board app. Help the user manage their board.

Always respond with a JSON object in exactly this format:
{
  "message": "Your response to the user",
  "board": null
}

If the user asks you to modify the board (add/move/delete cards, rename columns), respond with the full updated board in the "board" field:
{
  "message": "Your response explaining what you did",
  "board": { ...full updated board... }
}

The board has:
- columns: array of {id, title, cardIds}
- cards: object mapping card id to {id, title, details}

When creating new cards, use a unique id like "card-" followed by a short random string (e.g. "card-abc123").
Only update the board when the user explicitly asks you to change something. Otherwise set "board" to null."""


@router.post("/ai/chat")
async def chat(body: ChatRequest, user: User = Depends(get_current_user)):
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY not configured")

    client = AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )

    system_message = SYSTEM_PROMPT + f"\n\nCurrent board:\n{json.dumps(body.board)}"

    messages = [{"role": "system", "content": system_message}]
    for msg in body.history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": body.message})

    response = await client.chat.completions.create(
        model="openai/gpt-4o",
        messages=messages,
        response_format={"type": "json_object"},
    )

    raw = response.choices[0].message.content
    try:
        parsed = json.loads(raw)
        return {
            "message": parsed.get("message", ""),
            "board": parsed.get("board"),
        }
    except (json.JSONDecodeError, AttributeError):
        return {"message": raw, "board": None}
