"use client";

import { useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";

type ChatSidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onProjectRefresh: () => void;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  plan?: string;
  plan_workstream?: string;
};

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
  projectId,
  onProjectRefresh,
}: ChatSidebarProps) => {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasPendingPlan, setHasPendingPlan] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const loadedProjectRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load chat history when sidebar opens
  useEffect(() => {
    if (isOpen && loadedProjectRef.current !== projectId) {
      loadedProjectRef.current = projectId;
      api
        .getProjectChatHistory(projectId)
        .then((history) => setMessages(history.map((m) => ({ ...m }))))
        .catch(() => setMessages([]));
    }
  }, [isOpen, projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text.trim() };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput("");
    setLoading(true);

    try {
      const response = await api.sendProjectChat(projectId, text.trim());

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: response.reply,
        plan: response.plan ?? undefined,
        plan_workstream: response.plan_workstream ?? undefined,
      };
      setMessages([...withUser, assistantMsg]);

      // Track plan state
      if (response.plan) {
        setHasPendingPlan(true);
      } else if (response.board_updates && response.board_updates.length > 0) {
        setHasPendingPlan(false);
        onProjectRefresh();
      }

      if (response.create_board) {
        try {
          await api.createBoardFromAI(response.create_board, projectId);
          onProjectRefresh();
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be uploaded again
    e.target.value = "";

    setUploadingFile(true);
    try {
      const result = await api.uploadPdf(file);
      const fileMsg = `I've uploaded a document: **${result.filename}** (${result.pages} pages). Here is the full content:\n\n${result.text}\n\nPlease read this document and build a complete project based on it. Present your plan first, organized by workstream.`;
      await sendMessage(fileMsg);
    } catch {
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: "Failed to read the uploaded file. Please make sure it's a valid PDF.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setUploadingFile(false);
    }
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
              Project Chat
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
            <p className="mb-4 text-center text-sm text-[var(--gray-text)]">
              Ask the AI to help manage your project. It can create workstreams, columns, cards, assess quality, and more.
            </p>
          )}

          {/* Quick action buttons */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => sendMessage("Assess the quality of this board and suggest improvements.")}
              disabled={loading}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)] disabled:opacity-50"
            >
              Assess quality
            </button>
            <button
              type="button"
              onClick={() => sendMessage("I want to add a new workstream to this project.")}
              disabled={loading}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--secondary-purple)] transition hover:border-[var(--secondary-purple)] disabled:opacity-50"
            >
              Add workstream
            </button>
            <button
              type="button"
              onClick={() => sendMessage("Help me understand what I can do here.")}
              disabled={loading}
              className="rounded-full border border-[var(--stroke)] px-3 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)] disabled:opacity-50"
            >
              Help
            </button>
          </div>

          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i}>
                <div
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

                {/* Plan display with approve/revise buttons */}
                {msg.plan && (
                  <div className="mt-2 ml-0 rounded-2xl border-2 border-[var(--primary-blue)]/30 bg-blue-50/50 p-4">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--primary-blue)]">
                      Proposed Plan
                    </p>
                    <div className="text-sm leading-relaxed text-[var(--navy-dark)]">
                      {renderMessage(msg.plan)}
                    </div>
                    {/* Only show buttons on the last message if plan is pending */}
                    {i === messages.length - 1 && hasPendingPlan && !loading && (
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => sendMessage("Approved. Go ahead and implement the plan.")}
                          className="rounded-full bg-[var(--primary-blue)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInput("I'd like to change the plan: ");
                            textareaRef.current?.focus();
                          }}
                          className="rounded-full border border-[var(--stroke)] px-4 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                        >
                          Revise
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Workstream progress indicator */}
                {msg.plan_workstream && (
                  <div className="mt-1 ml-0 flex items-center gap-2 text-xs text-[var(--primary-blue)]">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--primary-blue)]" />
                    Building: {msg.plan_workstream}
                  </div>
                )}
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

        {/* Uploading indicator */}
        {uploadingFile && (
          <div className="border-t border-[var(--stroke)] px-6 py-2">
            <p className="text-xs text-[var(--primary-blue)] flex items-center gap-2">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--primary-blue)]" />
              Reading PDF...
            </p>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="border-t border-[var(--stroke)] px-6 py-4"
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
          />

          <div className="flex gap-2">
            {/* Upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || uploadingFile}
              className="self-end flex-shrink-0 rounded-xl border border-[var(--stroke)] p-3 text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)] disabled:opacity-50"
              title="Upload PDF"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 10v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3" />
                <polyline points="8 2 8 10" />
                <polyline points="5 5 8 2 11 5" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your project..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              style={{ maxHeight: "160px" }}
              disabled={loading || uploadingFile}
            />
            <button
              type="submit"
              disabled={loading || uploadingFile || !input.trim()}
              className="self-end rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
};
