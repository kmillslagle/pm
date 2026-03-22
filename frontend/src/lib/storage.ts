import type { BoardData, Column } from "./kanban";

const PREFIX = "kanban_";
const KEYS = {
  projects: `${PREFIX}projects`,
  activeProject: `${PREFIX}active_project`,
  board: (id: string) => `${PREFIX}board_${id}`,
  chat: (id: string) => `${PREFIX}chat_${id}`,
};

export type ProjectConfig = {
  id: string;
  name: string;
  description: string;
  columns: { id: string; title: string }[];
  createdAt: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// --- Project configs ---

export function loadProjects(): ProjectConfig[] {
  const raw = localStorage.getItem(KEYS.projects);
  return raw ? JSON.parse(raw) : [];
}

export function saveProjects(projects: ProjectConfig[]): void {
  localStorage.setItem(KEYS.projects, JSON.stringify(projects));
}

// --- Board data ---

export function loadBoard(projectId: string): BoardData | null {
  const raw = localStorage.getItem(KEYS.board(projectId));
  return raw ? JSON.parse(raw) : null;
}

export function saveBoard(projectId: string, board: BoardData): void {
  localStorage.setItem(KEYS.board(projectId), JSON.stringify(board));
}

// --- Chat history ---

export function loadChat(projectId: string): ChatMessage[] {
  const raw = localStorage.getItem(KEYS.chat(projectId));
  return raw ? JSON.parse(raw) : [];
}

export function saveChat(projectId: string, messages: ChatMessage[]): void {
  localStorage.setItem(KEYS.chat(projectId), JSON.stringify(messages));
}

// --- Active project ---

export function getActiveProjectId(): string | null {
  return localStorage.getItem(KEYS.activeProject);
}

export function setActiveProjectId(projectId: string): void {
  localStorage.setItem(KEYS.activeProject, projectId);
}

// --- Create & delete ---

export function createProject(config: ProjectConfig): BoardData {
  const projects = loadProjects();
  projects.push(config);
  saveProjects(projects);

  const columns: Column[] = config.columns.map((col) => ({
    id: col.id,
    title: col.title,
    cardIds: [],
  }));

  const board: BoardData = { columns, cards: {} };
  saveBoard(config.id, board);
  return board;
}

export function deleteProject(projectId: string): void {
  const projects = loadProjects().filter((p) => p.id !== projectId);
  saveProjects(projects);

  localStorage.removeItem(KEYS.board(projectId));
  localStorage.removeItem(KEYS.chat(projectId));

  if (getActiveProjectId() === projectId) {
    localStorage.removeItem(KEYS.activeProject);
  }
}
