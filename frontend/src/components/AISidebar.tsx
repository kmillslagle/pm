"use client";

import { useState, useRef, useEffect } from "react";
import { chatWithAI, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type AISidebarProps = {
  board: BoardData;
  onBoardChange: (board: BoardData) => void;
  onClose: () => void;
};

export const AISidebar = ({ board, onBoardChange, onClose }: AISidebarProps) => {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setInput("");
    setError("");
    const newHistory: ChatMessage[] = [...history, { role: "user", content: message }];
    setHistory(newHistory);
    setLoading(true);

    try {
      const result = await chatWithAI(message, history, board);
      setHistory([...newHistory, { role: "assistant", content: result.message }]);
      if (result.board) {
        onBoardChange(result.board);
      }
    } catch {
      setError("Failed to reach AI. Check your API key and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed right-0 top-0 flex h-full w-[380px] flex-col border-l border-[var(--stroke)] bg-white shadow-[-8px_0_32px_rgba(3,33,71,0.08)]">
      <div className="flex items-center justify-between border-b border-[var(--stroke)] px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            AI Assistant
          </p>
          <h2 className="mt-1 font-display text-base font-semibold text-[var(--navy-dark)]">
            Board Chat
          </h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {history.length === 0 && (
          <p className="text-center text-sm text-[var(--gray-text)]">
            Ask me to add, move, or update cards on your board.
          </p>
        )}
        <div className="space-y-4">
          {history.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                  msg.role === "user"
                    ? "bg-[var(--secondary-purple)] text-white"
                    : "bg-[var(--surface)] text-[var(--navy-dark)]"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface)] px-4 py-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--gray-text)] [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--gray-text)] [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--gray-text)] [animation-delay:300ms]" />
              </div>
            </div>
          )}
          {error && (
            <p className="text-center text-sm font-medium text-red-500">{error}</p>
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[var(--stroke)] px-5 py-4">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the AI..."
            disabled={loading}
            className="flex-1 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-2.5 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};
