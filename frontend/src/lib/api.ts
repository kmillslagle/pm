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

export async function login(username: string, password: string): Promise<{ username: string }> {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function register(username: string, password: string, email?: string): Promise<{ username: string }> {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, password, ...(email ? { email } : {}) }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

export async function getMe(): Promise<{ username: string }> {
  return apiFetch("/api/auth/me");
}

export type Subtask = { id: string; title: string; done: boolean };

export type Card = {
  id: string;
  title: string;
  details: string;
  priority?: "high" | "medium" | "low" | "none";
  notes?: string;
  dueDate?: string;
  subtasks?: Subtask[];
  dependencies?: string[];
  deliverableType?: string;
  keyReferences?: string;
};

export type Column = { id: string; title: string; cardIds: string[] };
export type BoardData = { columns: Column[]; cards: Record<string, Card> };
export type BoardInfo = { id: number; name: string; project_id?: number | null };
export type ProjectInfo = { id: number; name: string; workstream_count: number };

export type WorkstreamData = {
  id: number;
  name: string;
  columns: Column[];
  cards: Record<string, Card>;
};

export type ProjectBoardData = {
  project_id: number;
  project_name: string;
  workstreams: WorkstreamData[];
};

export async function listProjects(): Promise<ProjectInfo[]> {
  return apiFetch("/api/projects");
}

export async function createProject(name: string): Promise<ProjectInfo> {
  return apiFetch("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
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

export async function listBoards(): Promise<BoardInfo[]> {
  return apiFetch("/api/boards");
}

export async function getBoard(boardId: number): Promise<BoardData> {
  return apiFetch(`/api/boards/${boardId}`);
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
  return apiFetch(`/api/cards/${cardId}`, {
    method: "PUT",
    body: JSON.stringify(fields),
  });
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type BoardUpdate = {
  action: string;
  card_id?: string;
  column_id?: string;
  title?: string;
  details?: string;
  position?: number;
  priority?: string;
  notes?: string;
};

export type CreateBoardPayload = {
  name: string;
  columns: { name: string; cards: { title: string; details: string }[] }[];
};

export type ChatResponse = {
  reply: string;
  board_updates: BoardUpdate[];
  create_board?: CreateBoardPayload;
};

export async function sendChatMessage(boardId: number, message: string): Promise<ChatResponse> {
  return apiFetch(`/api/chat?board_id=${boardId}`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function getChatHistory(boardId: number): Promise<ChatMessage[]> {
  return apiFetch(`/api/chat/history?board_id=${boardId}`);
}

export async function createBoardFromAI(payload: CreateBoardPayload, projectId?: number): Promise<BoardInfo> {
  return apiFetch("/api/boards/from-ai", {
    method: "POST",
    body: JSON.stringify({ ...payload, ...(projectId != null ? { project_id: projectId } : {}) }),
  });
}

export type BuildMessage = { role: "user" | "assistant"; content: string };

export async function aiBuildBoard(message: string, history: BuildMessage[]): Promise<ChatResponse> {
  return apiFetch("/api/boards/ai-build", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
}
