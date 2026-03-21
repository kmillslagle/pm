import type { BoardData } from "./kanban";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res;
}

export async function getMe(): Promise<{ username: string } | null> {
  const res = await request("/api/auth/me");
  if (!res.ok) return null;
  return res.json();
}

export async function login(username: string, password: string): Promise<boolean> {
  const res = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return res.ok;
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
}

export async function getBoard(): Promise<BoardData | null> {
  const res = await request("/api/board");
  if (!res.ok) return null;
  return res.json();
}

export async function saveBoard(board: BoardData): Promise<void> {
  await request("/api/board", {
    method: "PUT",
    body: JSON.stringify(board),
  });
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function chatWithAI(
  message: string,
  history: ChatMessage[],
  board: BoardData
): Promise<{ message: string; board: BoardData | null }> {
  const res = await request("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message, history, board }),
  });
  if (!res.ok) throw new Error("AI request failed");
  return res.json();
}
