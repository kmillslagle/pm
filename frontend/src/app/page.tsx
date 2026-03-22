"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ProjectWizard } from "@/components/ProjectWizard";
import { LoginForm } from "@/components/LoginForm";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [boards, setBoards] = useState<api.BoardInfo[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showProjectList, setShowProjectList] = useState(false);
  const [ready, setReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Check auth on mount
  useEffect(() => {
    api
      .getMe()
      .then(async (user) => {
        setUsername(user.username);
        const boardList = await api.listBoards();
        setBoards(boardList);
        setAuthChecked(true);
        setReady(true);
      })
      .catch(() => {
        setAuthChecked(true);
        setReady(true);
      });
  }, []);

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;

  // Load board when activeBoardId changes
  useEffect(() => {
    if (activeBoardId == null) {
      setBoard(null);
      return;
    }
    api.getBoard(activeBoardId).then(setBoard).catch(() => setBoard(null));
  }, [activeBoardId]);

  // --- Auth handlers ---

  const handleLogin = useCallback(async (user: string) => {
    setUsername(user);
    const boardList = await api.listBoards();
    setBoards(boardList);
  }, []);

  const handleLogout = useCallback(async () => {
    await api.logout();
    setUsername(null);
    setBoards([]);
    setActiveBoardId(null);
    setBoard(null);
  }, []);

  // --- Project management ---

  const handleCreateProject = useCallback(
    async (info: { id: number; name: string }) => {
      const boardList = await api.listBoards();
      setBoards(boardList);
      setActiveBoardId(info.id);
      setShowWizard(false);
    },
    []
  );

  const handleSelectProject = useCallback(async (boardId: number) => {
    setActiveBoardId(boardId);
    setShowProjectList(false);
  }, []);

  const handleBoardCreated = useCallback(
    async (boardId: number) => {
      const boardList = await api.listBoards();
      setBoards(boardList);
      setActiveBoardId(boardId);
    },
    []
  );

  const handleBoardRefresh = useCallback(async () => {
    if (activeBoardId == null) return;
    const refreshed = await api.getBoard(activeBoardId);
    setBoard(refreshed);
  }, [activeBoardId]);

  // --- Render ---

  if (!ready) return null;

  // Not authenticated — show login
  if (authChecked && !username) {
    return <LoginForm onLogin={handleLogin} />;
  }

  // No active board — show welcome / project selector
  if (!activeBoard || !board) {
    return (
      <>
        <div className="relative min-h-screen overflow-hidden">
          <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

          <div className="fixed right-6 top-4 z-30">
            <button
              onClick={handleLogout}
              className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Sign out
            </button>
          </div>

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

            {boards.length > 0 && (
              <div className="w-full space-y-3">
                <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                  Or open an existing project
                </p>
                <div className="space-y-2">
                  {boards.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-white p-4 shadow-[0_4px_12px_rgba(3,33,71,0.06)] transition hover:shadow-[var(--shadow)]"
                    >
                      <button
                        onClick={() => handleSelectProject(b.id)}
                        className="flex-1 text-left"
                      >
                        <h3 className="font-display text-base font-semibold text-[var(--navy-dark)]">
                          {b.name}
                        </h3>
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
        <button
          onClick={handleLogout}
          className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Sign out
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
            {boards.map((b) => (
              <button
                key={b.id}
                onClick={() => handleSelectProject(b.id)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                  b.id === activeBoardId
                    ? "bg-[var(--primary-blue)]/10 font-semibold text-[var(--primary-blue)]"
                    : "text-[var(--navy-dark)] hover:bg-[var(--surface)]"
                }`}
              >
                {b.name}
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
        boardId={activeBoardId!}
        projectName={activeBoard.name}
        board={board}
        onBoardChange={setBoard}
        onBoardCreated={handleBoardCreated}
      />

      <ChatSidebar
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        boardId={activeBoardId!}
        board={board}
        onBoardRefresh={handleBoardRefresh}
        onBoardCreated={handleBoardCreated}
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
