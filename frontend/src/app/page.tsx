"use client";

import { useEffect, useState, useCallback } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { AISidebar } from "@/components/AISidebar";
import { getMe, login, logout, getBoard, saveBoard } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

export default function Home() {
  const [user, setUser] = useState<string | null | undefined>(undefined);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    getMe().then((me) => {
      setUser(me?.username ?? null);
    });
  }, []);

  useEffect(() => {
    if (user) {
      getBoard().then((b) => setBoard(b));
    }
  }, [user]);

  const handleBoardChange = useCallback(async (newBoard: BoardData) => {
    setBoard(newBoard);
    await saveBoard(newBoard);
  }, []);

  const handleLogin = async (username: string, password: string) => {
    setLoginError("");
    const ok = await login(username, password);
    if (ok) {
      const me = await getMe();
      setUser(me?.username ?? null);
    } else {
      setLoginError("Invalid credentials");
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setBoard(null);
  };

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary-blue)] border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <LoginForm onLogin={handleLogin} error={loginError} />;
  }

  return (
    <div className="flex min-h-screen overflow-hidden">
      <div className={`flex-1 overflow-auto transition-all ${sidebarOpen ? "mr-[380px]" : ""}`}>
        {board ? (
          <KanbanBoard
            boardData={board}
            onBoardChange={handleBoardChange}
            username={user}
            onLogout={handleLogout}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            sidebarOpen={sidebarOpen}
          />
        ) : (
          <div className="flex min-h-screen items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary-blue)] border-t-transparent" />
          </div>
        )}
      </div>
      {sidebarOpen && board && (
        <AISidebar
          board={board}
          onBoardChange={handleBoardChange}
          onClose={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

function LoginForm({
  onLogin,
  error,
}: {
  onLogin: (username: string, password: string) => void;
  error: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await onLogin(username, password);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
      <div className="w-full max-w-sm rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Welcome to
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Kanban Studio
        </h1>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            required
            className="w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            required
            className="w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          {error && (
            <p className="text-sm font-medium text-red-500">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--secondary-purple)] py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
