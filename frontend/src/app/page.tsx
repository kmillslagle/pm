"use client";

import { useCallback, useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { ChatSidebar } from "@/components/ChatSidebar";
import { getMe, logout } from "@/lib/api";

export default function Home() {
  const [user, setUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [boardKey, setBoardKey] = useState(0);

  useEffect(() => {
    getMe()
      .then((u) => setUser(u.username))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const handleBoardUpdate = useCallback(() => {
    setBoardKey((k) => k + 1);
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
  };

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
          onClick={handleLogout}
          className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Sign out
        </button>
      </div>
      <KanbanBoard key={boardKey} />
      <ChatSidebar
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        onBoardUpdate={handleBoardUpdate}
      />
    </>
  );
}
