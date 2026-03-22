"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { ChatSidebar } from "@/components/ChatSidebar";
import { ProjectWizard } from "@/components/ProjectWizard";
import { getMe, logout, listBoards, createBoard, type BoardInfo } from "@/lib/api";

export default function Home() {
  const [user, setUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [boardKey, setBoardKey] = useState(0);
  const [boards, setBoards] = useState<BoardInfo[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    getMe()
      .then((u) => setUser(u.username))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (user) {
      listBoards().then((b) => {
        setBoards(b);
        if (b.length > 0 && activeBoardId === null) {
          setActiveBoardId(b[0].id);
        }
      });
    }
  }, [user, activeBoardId]);

  const handleBoardUpdate = useCallback(() => {
    setBoardKey((k) => k + 1);
  }, []);

  const handleCreateProject = async (name: string, columns: string[]) => {
    try {
      const board = await createBoard(name, columns.length > 0 ? columns : undefined);
      setBoards((prev) => [...prev, board]);
      setActiveBoardId(board.id);
      setShowWizard(false);
      setBoardKey((k) => k + 1);
    } catch {
      // Board creation failed
    }
  };

  const handleChatCreateProject = useCallback(() => {
    // Refresh the board list when AI creates a project
    listBoards().then((b) => {
      setBoards(b);
      if (b.length > 0) {
        setActiveBoardId(b[b.length - 1].id);
        setBoardKey((k) => k + 1);
      }
    });
  }, []);

  if (checking) {
    return null;
  }

  if (!user) {
    return <LoginForm onLogin={setUser} />;
  }

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setBoards([]);
    setActiveBoardId(null);
  };

  const activeBoardName = boards.find((b) => b.id === activeBoardId)?.name;

  return (
    <>
      {/* Top bar */}
      <div className="fixed left-6 top-4 z-30 flex items-center gap-3">
        <select
          value={activeBoardId ?? ""}
          onChange={(e) => {
            setActiveBoardId(Number(e.target.value));
            setBoardKey((k) => k + 1);
          }}
          className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowWizard(true)}
          className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          + New Project
        </button>
      </div>

      <div className="fixed right-6 top-4 z-30 flex items-center gap-3">
        <button
          onClick={() => setChatOpen(!chatOpen)}
          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 ${
            chatOpen
              ? "bg-[var(--secondary-purple)]"
              : "bg-[var(--primary-blue)]"
          }`}
        >
          {chatOpen ? "Close Chat" : "AI Chat"}
        </button>
        <button
          onClick={handleLogout}
          className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Sign out
        </button>
      </div>

      {/* Main content area - shrinks when chat is open */}
      <div
        className="transition-all duration-300"
        style={{ marginRight: chatOpen ? "24rem" : "0" }}
      >
        {activeBoardId && (
          <KanbanBoard
            key={`${activeBoardId}-${boardKey}`}
            boardId={activeBoardId}
            projectName={activeBoardName}
          />
        )}
      </div>

      {/* Chat panel */}
      {activeBoardId && (
        <ChatSidebar
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          onBoardUpdate={handleBoardUpdate}
          boardId={activeBoardId}
          onCreateProject={handleChatCreateProject}
        />
      )}

      {/* Project wizard */}
      {showWizard && (
        <ProjectWizard
          onComplete={handleCreateProject}
          onCancel={() => setShowWizard(false)}
        />
      )}
    </>
  );
}
