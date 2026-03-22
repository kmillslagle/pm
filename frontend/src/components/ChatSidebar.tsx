"use client";

import { useEffect, useRef, useState } from "react";
import { sendChatMessage, getChatHistory, type ChatMessage } from "@/lib/api";

type ChatSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  onBoardUpdate: () => void;
  boardId: number;
  onCreateProject?: (name: string, columns: string[]) => void;
};

function renderInline(text: string, lineKey: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const boldRegex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <strong key={`${lineKey}-b-${match.index}`}>{match[1]}</strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderMessage(content: string): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trimStart();
    const lineKey = `line-${i}`;

    if (trimmed.startsWith("- ")) {
      const bulletText = trimmed.slice(2);
      elements.push(
        <div key={lineKey} className="flex gap-2 pl-2">
          <span className="shrink-0">&bull;</span>
          <span>{renderInline(bulletText, lineKey)}</span>
        </div>
      );
    } else {
      if (i > 0) {
        elements.push(<br key={`${lineKey}-br`} />);
      }
      elements.push(
        <span key={lineKey}>{renderInline(line, lineKey)}</span>
      );
    }
  });

  return <>{elements}</>;
}

const QUICK_ACTIONS = [
  { label: "Board status", message: "show board status" },
  { label: "Help", message: "help" },
];

const EXAMPLE_COMMANDS = [
  "Add card Fix login bug to In Progress",
  "Move card X to Done",
  "Create a new project called Marketing",
  "Show board status",
];

export const ChatSidebar = ({
  isOpen,
  onClose,
  onBoardUpdate,
  boardId,
  onCreateProject,
}: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      getChatHistory(boardId).then(setMessages);
    }
  }, [isOpen, boardId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setLoading(true);

    try {
      const response = await sendChatMessage(boardId, trimmed);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.reply },
      ]);

      if (response.board_updates.length > 0) {
        onBoardUpdate();

        if (onCreateProject) {
          const createAction = response.board_updates.find(
            (u) => u.action === "create_board"
          );
          if (createAction) {
            onCreateProject(
              createAction.title ?? "New Project",
              createAction.details ? createAction.details.split(",").map((s) => s.trim()) : []
            );
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to get a response." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };

  return (
    <aside
      className={`fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-sm flex-col border-l border-[var(--stroke)] bg-white shadow-[-4px_0_24px_rgba(3,33,71,0.08)] transition-transform duration-300 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ height: "100vh" }}
    >
      {/* Header */}
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Quick action pills */}
        <div className="mb-4 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => sendMessage(action.message)}
              disabled={loading}
              className="rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)] disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="mt-4 rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-5">
            <p className="mb-3 text-sm font-semibold text-[var(--navy-dark)]">
              Welcome! Try asking me to:
            </p>
            <ul className="space-y-2">
              {EXAMPLE_COMMANDS.map((cmd) => (
                <li key={cmd} className="flex items-start gap-2 text-xs text-[var(--gray-text)]">
                  <span className="mt-0.5 shrink-0 text-[var(--primary-blue)]">&bull;</span>
                  <span>&ldquo;{cmd}&rdquo;</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Message list */}
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
                {renderMessage(msg.content)}
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

      {/* Input */}
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
    </aside>
  );
};
