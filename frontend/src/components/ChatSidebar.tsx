"use client";

import { useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ChatSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  boardId: number;
  board: BoardData | null;
  onBoardRefresh: () => void;
  onBoardCreated: (boardId: number) => void;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

function renderInline(text: string, lineKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <strong key={`b-${lineKey}-${match.index}`}>{match[1]}</strong>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMessage(content: string) {
  const parts: React.ReactNode[] = [];
  const lines = content.split("\n");

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) {
      parts.push(<br key={`br-${lineIdx}`} />);
    }

    // List items: "- item" or "  - item"
    const listMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (listMatch) {
      parts.push(
        <span key={`li-${lineIdx}`} className="flex gap-1.5">
          <span className="shrink-0">&bull;</span>
          <span>{renderInline(listMatch[2], lineIdx)}</span>
        </span>
      );
      return;
    }

    parts.push(
      <span key={`line-${lineIdx}`}>{renderInline(line, lineIdx)}</span>
    );
  });

  return <>{parts}</>;
}

export const ChatSidebar = ({
  isOpen,
  onClose,
  boardId,
  board,
  onBoardRefresh,
  onBoardCreated,
}: ChatSidebarProps) => {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadedBoardRef = useRef<number | null>(null);

  // Load chat history when sidebar opens
  useEffect(() => {
    if (isOpen && loadedBoardRef.current !== boardId) {
      loadedBoardRef.current = boardId;
      api
        .getChatHistory(boardId)
        .then((history) => setMessages(history))
        .catch(() => setMessages([]));
    }
  }, [isOpen, boardId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput("");
    setLoading(true);

    try {
      const response = await api.sendChatMessage(boardId, text.trim());

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.reply,
      };
      setMessages([...withUser, assistantMsg]);

      if (response.board_updates && response.board_updates.length > 0) {
        onBoardRefresh();
      }

      if (response.create_board) {
        try {
          const newBoard = await api.createBoardFromAI(response.create_board);
          onBoardCreated(newBoard.id);
        } catch {
          // Board creation failed — the assistant message is already shown
        }
      }
    } catch {
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
      };
      setMessages([...withUser, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <aside
      className={`flex-shrink-0 flex flex-col overflow-hidden border-l border-[var(--stroke)] bg-white shadow-[-8px_0_32px_rgba(3,33,71,0.12)] transition-[width] duration-300 ${
        isOpen ? "w-[448px]" : "w-0"
      }`}
    >
      <div className="flex h-full min-w-[448px] flex-col">
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
              AI Assistant
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-[var(--navy-dark)]">
              Chat
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <p className="text-center text-sm text-[var(--gray-text)]">
              Ask the AI to help manage your board. It can create, move, update,
              or delete cards.
            </p>
          )}

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => sendMessage("show board")}
              disabled={loading}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)] disabled:opacity-50"
            >
              Show board
            </button>
            <button
              type="button"
              onClick={() => sendMessage("help")}
              disabled={loading}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)] disabled:opacity-50"
            >
              Help
            </button>
            <button
              type="button"
              onClick={() =>
                sendMessage(
                  "I want to build a new board from scratch. Help me set it up."
                )
              }
              disabled={loading}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--secondary-purple)] transition hover:border-[var(--secondary-purple)] disabled:opacity-50"
            >
              Build a Board
            </button>
          </div>

          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[var(--secondary-purple)] text-white"
                      : "border border-[var(--stroke)] bg-[var(--surface)] text-[var(--navy-dark)]"
                  }`}
                >
                  {msg.role === "assistant"
                    ? renderMessage(msg.content)
                    : msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--gray-text)]">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t border-[var(--stroke)] px-6 py-4"
        >
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your board..."
              className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
};
