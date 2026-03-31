const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<{ username: string }> {
  return apiFetch("/api/auth/me");
}

import type { Subtask, Card, Column, WorkstreamData, ProjectBoardData } from "@/lib/kanban";
export type { Subtask, Card, Column, WorkstreamData, ProjectBoardData };

export type BoardInfo = { id: number; name: string; project_id?: number | null };
export type ProjectInfo = { id: number; name: string; workstream_count: number };

export async function listProjects(): Promise<ProjectInfo[]> {
  return apiFetch("/api/projects");
}

export async function createProject(name: string): Promise<ProjectInfo> {
  return apiFetch("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
}

export async function updateProject(projectId: number, name: string): Promise<ProjectInfo> {
  return apiFetch(`/api/projects/${projectId}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export async function deleteProject(projectId: number): Promise<void> {
  await apiFetch(`/api/projects/${projectId}`, { method: "DELETE" });
}

export async function createWorkstream(
  projectId: number,
  name: string,
  columns?: string[]
): Promise<BoardInfo> {
  return apiFetch(`/api/projects/${projectId}/workstreams`, {
    method: "POST",
    body: JSON.stringify({ name, ...(columns ? { columns } : {}) }),
  });
}

export async function getProjectBoard(projectId: number): Promise<ProjectBoardData> {
  return apiFetch(`/api/projects/${projectId}/board`);
}

export async function createProjectBoard(
  projectId: number,
  workstreams: { name: string; columns: string[] }[]
): Promise<ProjectBoardData> {
  return apiFetch(`/api/projects/${projectId}/board`, {
    method: "POST",
    body: JSON.stringify({ workstreams }),
  });
}

export async function addColumn(boardId: number, title: string): Promise<{ id: string; title: string; cardIds: string[] }> {
  return apiFetch(`/api/boards/${boardId}/columns`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function renameColumn(columnId: string, title: string): Promise<void> {
  await apiFetch(`/api/columns/${columnId}`, {
    method: "PUT",
    body: JSON.stringify({ title }),
  });
}

export async function createCard(columnId: string, title: string, details: string): Promise<Card> {
  return apiFetch(`/api/columns/${columnId}/cards`, {
    method: "POST",
    body: JSON.stringify({ title, details }),
  });
}

export async function deleteCard(cardId: string): Promise<void> {
  await apiFetch(`/api/cards/${cardId}`, { method: "DELETE" });
}

export async function moveCard(cardId: string, columnId: string, position: number): Promise<void> {
  await apiFetch(`/api/cards/${cardId}/move`, {
    method: "PUT",
    body: JSON.stringify({ column_id: columnId, position }),
  });
}

export async function updateCard(
  cardId: string,
  fields: {
    title?: string;
    details?: string;
    priority?: string;
    notes?: string;
    due_date?: string;
    subtasks?: Subtask[];
    dependencies?: string[];
    deliverable_type?: string;
    key_references?: string;
  }
): Promise<Card> {
  const payload: Record<string, unknown> = { ...fields };
  if (fields.subtasks !== undefined) {
    payload.subtasks = JSON.stringify(fields.subtasks);
  }
  if (fields.dependencies !== undefined) {
    payload.dependencies = JSON.stringify(fields.dependencies);
  }
  return apiFetch(`/api/cards/${cardId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type BoardUpdate = {
  action: string;
  workstream_name?: string;
  workstream_id?: number;
  columns?: string[];
  card_id?: string;
  column_id?: string;
  column_title?: string;
  title?: string;
  details?: string;
  position?: number;
  priority?: string;
  notes?: string;
  due_date?: string;
  subtasks?: string;
  dependencies?: string;
  deliverable_type?: string;
  key_references?: string;
};

export type ChatResponse = {
  reply: string;
  board_updates: BoardUpdate[];
  plan?: string;
  plan_workstream?: string;
};

export async function sendProjectChat(projectId: number, message: string): Promise<ChatResponse> {
  return apiFetch(`/api/chat/project?project_id=${projectId}`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function getProjectChatHistory(projectId: number): Promise<ChatMessage[]> {
  return apiFetch(`/api/chat/project/history?project_id=${projectId}`);
}

export async function uploadPdf(file: File): Promise<{ text: string; filename: string; pages: number }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload/pdf`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }
  return res.json();
}
