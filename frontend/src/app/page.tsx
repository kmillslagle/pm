"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ProjectWizard } from "@/components/ProjectWizard";
import type { ChatAction } from "@/lib/chatEngine";
import { createId, type BoardData } from "@/lib/kanban";
import {
  loadProjects,
  loadBoard,
  saveBoard,
  loadChat,
  saveChat,
  getActiveProjectId,
  setActiveProjectId,
  createProject,
  deleteProject,
  type ProjectConfig,
  type ChatMessage,
} from "@/lib/storage";

export default function Home() {
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [activeProjectId, setActiveProject] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showProjectList, setShowProjectList] = useState(false);
  const [ready, setReady] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    const storedProjects = loadProjects();
    setProjects(storedProjects);

    const storedActiveId = getActiveProjectId();
    if (storedActiveId && storedProjects.some((p) => p.id === storedActiveId)) {
      const storedBoard = loadBoard(storedActiveId);
      if (storedBoard) {
        setActiveProject(storedActiveId);
        setBoard(storedBoard);
        setChatMessages(loadChat(storedActiveId));
      }
    }
    setReady(true);
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // --- Project management ---

  const handleCreateProject = useCallback((config: ProjectConfig) => {
    const newBoard = createProject(config);
    setActiveProjectId(config.id);
    setProjects(loadProjects());
    setActiveProject(config.id);
    setBoard(newBoard);
    setChatMessages([]);
    setShowWizard(false);
  }, []);

  const handleSelectProject = useCallback((projectId: string) => {
    const storedBoard = loadBoard(projectId);
    if (storedBoard) {
      setActiveProjectId(projectId);
      setActiveProject(projectId);
      setBoard(storedBoard);
      setChatMessages(loadChat(projectId));
      setShowProjectList(false);
    }
  }, []);

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      deleteProject(projectId);
      const remaining = loadProjects();
      setProjects(remaining);
      if (activeProjectId === projectId) {
        setActiveProject(null);
        setBoard(null);
        setChatMessages([]);
      }
    },
    [activeProjectId]
  );

  // --- Board changes ---

  const handleBoardChange = useCallback(
    (newBoard: BoardData) => {
      setBoard(newBoard);
      if (activeProjectId) {
        saveBoard(activeProjectId, newBoard);
      }
    },
    [activeProjectId]
  );

  // --- Chat ---

  const handleChatMessagesChange = useCallback(
    (msgs: ChatMessage[]) => {
      setChatMessages(msgs);
      if (activeProjectId) {
        saveChat(activeProjectId, msgs);
      }
    },
    [activeProjectId]
  );

  const handleChatActions = useCallback(
    (actions: ChatAction[]) => {
      if (!board || !activeProjectId) return;

      let updated = { ...board };

      for (const action of actions) {
        switch (action.type) {
          case "create_card": {
            const cardId = createId("card");
            const card = { id: cardId, title: action.title, details: action.details };
            updated = {
              ...updated,
              cards: { ...updated.cards, [cardId]: card },
              columns: updated.columns.map((col) =>
                col.id === action.columnId
                  ? { ...col, cardIds: [...col.cardIds, cardId] }
                  : col
              ),
            };
            break;
          }
          case "delete_card": {
            const { [action.cardId]: _, ...remainingCards } = updated.cards;
            updated = {
              ...updated,
              cards: remainingCards,
              columns: updated.columns.map((col) => ({
                ...col,
                cardIds: col.cardIds.filter((id) => id !== action.cardId),
              })),
            };
            break;
          }
          case "move_card": {
            updated = {
              ...updated,
              columns: updated.columns.map((col) => {
                let cardIds = col.cardIds.filter((id) => id !== action.cardId);
                if (col.id === action.toColumnId) {
                  cardIds = [...cardIds, action.cardId];
                }
                return { ...col, cardIds };
              }),
            };
            break;
          }
          case "rename_column": {
            updated = {
              ...updated,
              columns: updated.columns.map((col) =>
                col.id === action.columnId ? { ...col, title: action.title } : col
              ),
            };
            break;
          }
          case "add_column": {
            const colId = createId("col");
            updated = {
              ...updated,
              columns: [...updated.columns, { id: colId, title: action.title, cardIds: [] }],
            };
            break;
          }
          case "delete_column": {
            const col = updated.columns.find((c) => c.id === action.columnId);
            const cardIdsToRemove = col?.cardIds ?? [];
            const remainingCards = Object.fromEntries(
              Object.entries(updated.cards).filter(([id]) => !cardIdsToRemove.includes(id))
            );
            updated = {
              ...updated,
              cards: remainingCards,
              columns: updated.columns.filter((c) => c.id !== action.columnId),
            };
            break;
          }
        }
      }

      setBoard(updated);
      saveBoard(activeProjectId, updated);
    },
    [board, activeProjectId]
  );

  // --- Render ---

  if (!ready) return null;

  // No projects or no active project — show welcome / project selector
  if (!activeProject || !board) {
    return (
      <>
        <div className="relative min-h-screen overflow-hidden">
          <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

          <main className="relative mx-auto flex min-h-screen max-w-[700px] flex-col items-center justify-center gap-8 px-6 py-16">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Project Management
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--gray-text)]">
                Create a project to get started. Choose a template or customize your
                own board with the columns that fit your workflow.
              </p>
            </div>

            <button
              onClick={() => setShowWizard(true)}
              className="rounded-full bg-[var(--secondary-purple)] px-8 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              New Project
            </button>

            {projects.length > 0 && (
              <div className="w-full space-y-3">
                <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Or open an existing project
                </p>
                <div className="space-y-2">
                  {projects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-white p-4 shadow-[0_4px_12px_rgba(3,33,71,0.06)] transition hover:shadow-[var(--shadow)]"
                    >
                      <button
                        onClick={() => handleSelectProject(project.id)}
                        className="flex-1 text-left"
                      >
                        <h3 className="font-display text-base font-semibold text-[var(--navy-dark)]">
                          {project.name}
                        </h3>
                        {project.description && (
                          <p className="mt-1 text-sm text-[var(--gray-text)]">
                            {project.description}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-[var(--gray-text)]">
                          {project.columns.length} columns &middot; Created{" "}
                          {new Date(project.createdAt).toLocaleDateString()}
                        </p>
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="ml-4 rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-red-500"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>

        {showWizard && (
          <ProjectWizard
            onComplete={handleCreateProject}
            onCancel={() => setShowWizard(false)}
          />
        )}
      </>
    );
  }

  // Active project with board
  return (
    <>
      <div className="fixed right-6 top-4 z-30 flex items-center gap-3">
        <button
          onClick={() => setChatOpen(true)}
          className="rounded-full bg-[var(--primary-blue)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          AI Chat
        </button>
        <button
          onClick={() => setShowProjectList(!showProjectList)}
          className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Projects
        </button>
      </div>

      {showProjectList && (
        <div className="fixed left-6 top-4 z-30 w-72 rounded-2xl border border-[var(--stroke)] bg-white p-4 shadow-[var(--shadow)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Projects
            </p>
            <button
              onClick={() => setShowProjectList(false)}
              className="text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
            >
              Close
            </button>
          </div>
          <div className="space-y-2">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleSelectProject(project.id)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                  project.id === activeProjectId
                    ? "bg-[var(--primary-blue)]/10 font-semibold text-[var(--primary-blue)]"
                    : "text-[var(--navy-dark)] hover:bg-[var(--surface)]"
                }`}
              >
                {project.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setShowProjectList(false);
              setShowWizard(true);
            }}
            className="mt-3 w-full rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
          >
            New Project
          </button>
        </div>
      )}

      <KanbanBoard
        projectId={activeProjectId!}
        projectName={activeProject.name}
        board={board}
        onBoardChange={handleBoardChange}
      />

      <ChatSidebar
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        board={board}
        messages={chatMessages}
        onAction={handleChatActions}
        onMessagesChange={handleChatMessagesChange}
      />

      {showWizard && (
        <ProjectWizard
          onComplete={handleCreateProject}
          onCancel={() => setShowWizard(false)}
        />
      )}
    </>
  );
}
