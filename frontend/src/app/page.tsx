"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { ProjectBoard } from "@/components/ProjectBoard";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ProjectWizard } from "@/components/ProjectWizard";
import { LoginForm } from "@/components/LoginForm";
import * as api from "@/lib/api";
import type { BoardData, ProjectBoardData } from "@/lib/kanban";
import { SAMPLE_PROJECT, SAMPLE_PROJECT_ID } from "@/lib/sampleProject";

export default function Home() {
  const [username, setUsername] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Data
  const [projects, setProjects] = useState<api.ProjectInfo[]>([]);
  const [standaloneBoards, setStandaloneBoards] = useState<api.BoardInfo[]>([]);

  // Active context — project view
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [projectBoard, setProjectBoard] = useState<ProjectBoardData | null>(null);

  // Active context — standalone board view
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [board, setBoard] = useState<BoardData | null>(null);

  // UI
  const [chatOpen, setChatOpen] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showProjectList, setShowProjectList] = useState(false);
  const [homeView, setHomeView] = useState<"home" | "open" | "new">("home");

  // Load all top-level data
  const loadData = useCallback(async () => {
    const [projectList, boardList] = await Promise.all([
      api.listProjects(),
      api.listBoards(),
    ]);
    setProjects(projectList);
    setStandaloneBoards(boardList);
  }, []);

  // Auth check on mount
  useEffect(() => {
    api.getMe()
      .then(async (user) => {
        setUsername(user.username);
        await loadData();
        setAuthChecked(true);
        setReady(true);
      })
      .catch(() => {
        setAuthChecked(true);
        setReady(true);
      });
  }, [loadData]);

  // Load standalone board data when activeBoardId changes
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
    await loadData();
  }, [loadData]);

  const handleLogout = useCallback(async () => {
    await api.logout();
    setUsername(null);
    setProjects([]);
    setStandaloneBoards([]);
    setActiveProjectId(null);
    setProjectBoard(null);
    setActiveBoardId(null);
    setBoard(null);
  }, []);

  // --- Navigation ---

  const isSampleProject = activeProjectId === SAMPLE_PROJECT_ID;

  const handleSelectProject = useCallback(async (projectId: number) => {
    setActiveProjectId(projectId);
    setActiveBoardId(null);
    setBoard(null);
    setShowProjectList(false);
    if (projectId === SAMPLE_PROJECT_ID) {
      // Deep-clone so mutations don't affect the constant
      setProjectBoard(JSON.parse(JSON.stringify(SAMPLE_PROJECT)));
      return;
    }
    try {
      const pb = await api.getProjectBoard(projectId);
      setProjectBoard(pb);
    } catch {
      setProjectBoard(null);
    }
  }, []);

  const handleSelectStandaloneBoard = useCallback((boardId: number) => {
    setActiveProjectId(null);
    setProjectBoard(null);
    setActiveBoardId(boardId);
    setShowProjectList(false);
  }, []);

  const handleBackToProjects = useCallback(() => {
    setActiveProjectId(null);
    setProjectBoard(null);
    setActiveBoardId(null);
    setBoard(null);
    setHomeView("home");
  }, []);

  // --- Wizard callbacks ---

  const handleProjectWizardComplete = useCallback(async (info: { projectId: number; projectName: string }) => {
    setShowWizard(false);
    await loadData();
    setActiveProjectId(info.projectId);
    setActiveBoardId(null);
    setBoard(null);
    try {
      const pb = await api.getProjectBoard(info.projectId);
      setProjectBoard(pb);
    } catch {
      setProjectBoard(null);
    }
  }, [loadData]);

  // Called when AI chat creates a new board (standalone)
  const handleAIBoardCreated = useCallback(async (boardId: number) => {
    await loadData();
    setActiveProjectId(null);
    setProjectBoard(null);
    setActiveBoardId(boardId);
  }, [loadData]);

  const handleBoardRefresh = useCallback(async () => {
    if (activeBoardId == null) return;
    const refreshed = await api.getBoard(activeBoardId);
    setBoard(refreshed);
  }, [activeBoardId]);

  // --- Render helpers ---

  const sampleProjectInfo: api.ProjectInfo = {
    id: SAMPLE_PROJECT_ID,
    name: "Sample-Bake a cake",
    workstream_count: 2,
  };
  const allProjects = [sampleProjectInfo, ...projects];

  const activeProject = allProjects.find((p) => p.id === activeProjectId) ?? null;
  const activeStandaloneBoard = standaloneBoards.find((b) => b.id === activeBoardId) ?? null;

  // --- Render ---

  if (!ready) return null;

  if (authChecked && !username) {
    return <LoginForm onLogin={handleLogin} />;
  }

  // Welcome screen — no active board/project
  if (!activeBoardId && !activeProjectId) {
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

          <main className="relative mx-auto flex min-h-screen max-w-[640px] flex-col items-center justify-center gap-10 px-6 py-16">
            {/* Logo / title */}
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Project Management
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--gray-text)]">
                Welcome back, <span className="font-semibold text-[var(--navy-dark)]">{username}</span>.
                Organise work into projects with multiple workstreams.
              </p>
            </div>

            {/* Home: two choices */}
            {homeView === "home" && (
              <div className="w-full space-y-3">
                <button
                  onClick={() => setHomeView("open")}
                  className="flex w-full items-center gap-5 rounded-2xl border border-[var(--stroke)] bg-white p-6 shadow-[0_4px_12px_rgba(3,33,71,0.06)] text-left transition hover:shadow-[var(--shadow)] hover:border-[var(--primary-blue)]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[rgba(32,157,215,0.1)]">
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="var(--primary-blue)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7h16M3 11h10M3 15h7" />
                      <rect x="2" y="3" width="18" height="16" rx="3" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-base font-semibold text-[var(--navy-dark)]">
                      Open an Existing Project
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--gray-text)]">
                      {allProjects.length > 0
                        ? `${allProjects.length} project${allProjects.length !== 1 ? "s" : ""} available`
                        : "No projects yet"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-[var(--primary-blue)]">&rarr;</span>
                </button>

                <button
                  onClick={() => {
                    setShowWizard(true);
                  }}
                  className="flex w-full items-center gap-5 rounded-2xl border border-[var(--stroke)] bg-white p-6 shadow-[0_4px_12px_rgba(3,33,71,0.06)] text-left transition hover:shadow-[var(--shadow)] hover:border-[var(--secondary-purple)]"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[rgba(117,57,145,0.1)]">
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="var(--secondary-purple)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="11" y1="7" x2="11" y2="15" />
                      <line x1="7" y1="11" x2="15" y2="11" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-base font-semibold text-[var(--navy-dark)]">
                      Start a New Project
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--gray-text)]">
                      Set up workstreams and columns, or let AI design your board
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-[var(--secondary-purple)]">&rarr;</span>
                </button>
              </div>
            )}

            {/* Open: project list */}
            {homeView === "open" && (
              <div className="w-full space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
                    Your Projects
                  </h2>
                  <button
                    onClick={() => setHomeView("home")}
                    className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                  >
                    &larr; Back
                  </button>
                </div>

                {allProjects.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--stroke)] bg-white p-10 text-center">
                    <p className="text-sm font-medium text-[var(--gray-text)]">
                      No existing projects yet.
                    </p>
                    <p className="mt-1 text-xs text-[var(--gray-text)]">
                      Go back and start a new project to get going.
                    </p>
                    <button
                      onClick={() => setShowWizard(true)}
                      className="mt-5 rounded-full bg-[var(--secondary-purple)] px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                    >
                      Start New Project
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allProjects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleSelectProject(p.id)}
                        className="flex w-full items-center justify-between rounded-2xl border border-[var(--stroke)] bg-white p-5 shadow-[0_4px_12px_rgba(3,33,71,0.06)] transition hover:shadow-[var(--shadow)] hover:border-[var(--primary-blue)]"
                      >
                        <div className="text-left">
                          <h3 className="font-display text-base font-semibold text-[var(--navy-dark)]">
                            {p.name}
                          </h3>
                          <p className="mt-0.5 text-xs text-[var(--gray-text)]">
                            {p.workstream_count} workstream{p.workstream_count !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)]">
                          Open &rarr;
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {showWizard && (
          <ProjectWizard
            isNewProject
            onComplete={handleProjectWizardComplete}
            onCancel={() => setShowWizard(false)}
          />
        )}
      </>
    );
  }

  // Project view — project selected, show unified board
  if (activeProjectId && projectBoard) {
    return (
      <>
        {/* Fixed top-right controls */}
        <div className="fixed right-6 top-4 z-30 flex items-center gap-3">
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

        {/* Projects dropdown */}
        {showProjectList && (
          <div className="fixed left-6 top-4 z-30 w-80 rounded-2xl border border-[var(--stroke)] bg-white p-4 shadow-[var(--shadow)]">
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
            <div className="space-y-1">
              {allProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSelectProject(p.id)}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    p.id === activeProjectId
                      ? "bg-[var(--primary-blue)]/10 font-semibold text-[var(--primary-blue)]"
                      : "text-[var(--navy-dark)] hover:bg-[var(--surface)]"
                  }`}
                >
                  {p.name}
                  <span className="ml-2 text-[10px] text-[var(--gray-text)]">
                    {p.workstream_count}ws
                  </span>
                </button>
              ))}
            </div>
            <div className="pt-2 mt-2 border-t border-[var(--stroke)]">
              <button
                onClick={() => { setShowProjectList(false); handleBackToProjects(); }}
                className="w-full rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--secondary-purple)] transition hover:border-[var(--secondary-purple)]"
              >
                + New Project
              </button>
            </div>
          </div>
        )}

        <div className="flex h-screen flex-col overflow-hidden">
          <div className="flex-1 overflow-auto min-w-0">
            <ProjectBoard
              projectId={activeProjectId}
              projectBoard={projectBoard}
              onProjectBoardChange={setProjectBoard}
              isSample={isSampleProject}
            />
          </div>
        </div>

        {showWizard && (
          <ProjectWizard
            isNewProject
            onComplete={handleProjectWizardComplete}
            onCancel={() => setShowWizard(false)}
          />
        )}
      </>
    );
  }

  // Project selected but loading or empty
  if (activeProjectId && !projectBoard) {
    return (
      <>
        <div className="fixed right-6 top-4 z-30 flex items-center gap-3">
          <button
            onClick={handleBackToProjects}
            className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            &larr; Projects
          </button>
          <button
            onClick={handleLogout}
            className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Sign out
          </button>
        </div>
        <div className="flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]">
          Loading...
        </div>
      </>
    );
  }

  // Standalone board view
  const boardName = activeStandaloneBoard?.name ?? "";

  return (
    <>
      <div className="fixed right-6 top-4 z-30 flex items-center gap-3">
        {activeBoardId && (
          <button
            onClick={() => setChatOpen(true)}
            className="rounded-full bg-[var(--primary-blue)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
          >
            AI Chat
          </button>
        )}
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
        <div className="fixed left-6 top-4 z-30 w-80 rounded-2xl border border-[var(--stroke)] bg-white p-4 shadow-[var(--shadow)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Projects &amp; Boards
            </p>
            <button
              onClick={() => setShowProjectList(false)}
              className="text-xs font-semibold text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
            >
              Close
            </button>
          </div>

          {allProjects.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                Projects
              </p>
              <div className="space-y-1">
                {allProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProject(p.id)}
                    className="w-full rounded-xl px-3 py-2 text-left text-sm text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
                  >
                    {p.name}
                    <span className="ml-2 text-[10px] text-[var(--gray-text)]">
                      {p.workstream_count}ws
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {standaloneBoards.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                Boards
              </p>
              <div className="space-y-1">
                {standaloneBoards.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleSelectStandaloneBoard(b.id)}
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
            </div>
          )}

          <div className="pt-1 border-t border-[var(--stroke)]">
            <button
              onClick={() => { setShowProjectList(false); handleBackToProjects(); }}
              className="w-full rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--secondary-purple)] transition hover:border-[var(--secondary-purple)]"
            >
              + New Project
            </button>
          </div>
        </div>
      )}

      <div className="flex h-screen flex-col overflow-hidden">
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-auto min-w-0">
            {activeBoardId && board ? (
              <KanbanBoard
                boardId={activeBoardId}
                projectName={boardName}
                board={board}
                onBoardChange={setBoard}
                onBoardCreated={handleAIBoardCreated}
              />
            ) : activeBoardId && !board ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--gray-text)]">
                Loading...
              </div>
            ) : null}
          </div>

          <ChatSidebar
            isOpen={chatOpen}
            onClose={() => setChatOpen(false)}
            boardId={activeBoardId ?? 0}
            board={board}
            onBoardRefresh={handleBoardRefresh}
            onBoardCreated={handleAIBoardCreated}
          />
        </div>
      </div>
    </>
  );
}
