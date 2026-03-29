"use client";

import { useEffect, useRef, useState } from "react";
import * as api from "@/lib/api";

type Props = {
  projectId?: number; // if set, adds workstreams to existing project
  isNewProject?: boolean; // true when creating a brand new project (show project name step)
  onComplete: (info: { projectId: number; projectName: string }) => void;
  onCancel?: () => void;
};

type Template = "software" | "marketing" | "simple" | "custom";
type Mode = "choose" | "manual" | "ai";

const TEMPLATES: Record<
  Exclude<Template, "custom">,
  { label: string; columns: string[] }
> = {
  software: {
    label: "Software Development",
    columns: ["Backlog", "In Progress", "Review", "Testing", "Done"],
  },
  marketing: {
    label: "Marketing Campaign",
    columns: ["Ideas", "Planning", "In Progress", "Review", "Published"],
  },
  simple: {
    label: "Simple Kanban",
    columns: ["To Do", "In Progress", "Done"],
  },
};

const MAX_COLUMNS = 8;
const MIN_COLUMNS = 2;
const MAX_WORKSTREAMS = 10;

type WorkstreamConfig = {
  name: string;
  template: Template | null;
  customColumns: string[];
};

function resolveColumns(ws: WorkstreamConfig): string[] {
  if (ws.template && ws.template !== "custom") {
    return TEMPLATES[ws.template].columns;
  }
  return ws.customColumns;
}

/* ---- AI chat sub-component ---- */

type ChatMsg = { role: "user" | "assistant"; content: string };

function renderInline(text: string, key: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(<strong key={`b-${key}-${match.index}`}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderMessage(content: string) {
  const parts: React.ReactNode[] = [];
  content.split("\n").forEach((line, i) => {
    if (i > 0) parts.push(<br key={`br-${i}`} />);
    const listMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (listMatch) {
      parts.push(
        <span key={`li-${i}`} className="flex gap-1.5">
          <span className="shrink-0">&bull;</span>
          <span>{renderInline(listMatch[2], i)}</span>
        </span>
      );
    } else {
      parts.push(<span key={`line-${i}`}>{renderInline(line, i)}</span>);
    }
  });
  return <>{parts}</>;
}

type AIChatProps = {
  projectId?: number;
  onComplete: (info: { projectId: number; projectName: string }) => void;
  onSwitchToManual: () => void;
};

const AIBoardChat = ({ projectId, onComplete, onSwitchToManual }: AIChatProps) => {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [projId, setProjId] = useState<number | null>(projectId ?? null);
  const [projName, setProjName] = useState("");
  const [needsName, setNeedsName] = useState(!projectId);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    // If we don't have a project yet, create one first
    let currentProjId = projId;
    if (!currentProjId && needsName) {
      // Use the first message as project name (or a derived name)
      const name = text.trim().slice(0, 80);
      try {
        const proj = await api.createProject(name);
        currentProjId = proj.id;
        setProjId(proj.id);
        setProjName(proj.name);
        setNeedsName(false);
      } catch {
        setMessages([...messages, { role: "assistant", content: "Failed to create project. Please try again." }]);
        return;
      }
    }

    if (!currentProjId) return;

    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const response = await api.sendProjectChat(currentProjId, text.trim());

      const assistantMsg: ChatMsg = { role: "assistant", content: response.reply };
      const withReply = [...next, assistantMsg];
      setMessages(withReply);

      // If the AI made board_updates, the project now has workstreams
      if (response.board_updates && response.board_updates.length > 0) {
        // Project is being built — complete when user is satisfied
      }

      // Check if there's a plan — show approve hint
      if (response.plan) {
        setMessages([
          ...withReply.slice(0, -1),
          { role: "assistant", content: response.reply + "\n\n**Plan:**\n" + response.plan + "\n\nReply **approve** to build, or tell me what to change." },
        ]);
      }
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    if (projId) {
      onComplete({ projectId: projId, projectName: projName || "AI Project" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploadingFile(true);
    try {
      const result = await api.uploadPdf(file);
      const fileMsg = `I've uploaded a document: **${result.filename}** (${result.pages} pages). Here is the full content:\n\n${result.text}\n\nPlease read this document and build a complete project based on it. Present your plan first, organized by workstream.`;
      await sendMessage(fileMsg);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Failed to read the uploaded file. Please make sure it's a valid PDF." }]);
    } finally {
      setUploadingFile(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "440px" }}>
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && (
          <p className="text-sm text-center pt-4" style={{ color: "var(--gray-text)" }}>
            Describe your project and the AI will design workstreams, columns, and cards for you. The AI will present a plan for your approval before building.
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
              style={{
                backgroundColor:
                  msg.role === "user" ? "var(--secondary-purple)" : "var(--surface)",
                color: msg.role === "user" ? "#ffffff" : "var(--navy-dark)",
                border: msg.role === "assistant" ? "1px solid var(--stroke)" : "none",
              }}
            >
              {msg.role === "assistant" ? renderMessage(msg.content) : msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl px-4 py-3 text-sm"
              style={{
                backgroundColor: "var(--surface)",
                border: "1px solid var(--stroke)",
                color: "var(--gray-text)",
              }}
            >
              Thinking...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Uploading indicator */}
      {uploadingFile && (
        <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--primary-blue)" }}>
          <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: "var(--primary-blue)" }} />
          Reading PDF...
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileUpload}
        className="hidden"
      />

      <div className="mt-3 flex gap-2">
        {/* Upload PDF button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || uploadingFile}
          className="self-end flex-shrink-0 rounded-xl border p-2.5 transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)] disabled:opacity-50"
          style={{ borderColor: "var(--stroke)", color: "var(--gray-text)" }}
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          placeholder={needsName ? "Describe your project or upload a PDF..." : "Continue the conversation..."}
          disabled={loading || uploadingFile}
          rows={1}
          className="flex-1 resize-none rounded-xl border bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[var(--primary-blue)]"
          style={{ borderColor: "var(--stroke)", color: "var(--navy-dark)", maxHeight: "120px" }}
          autoFocus
        />
        <button
          type="button"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading || uploadingFile}
          className="self-end rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-40"
          style={{ backgroundColor: "var(--secondary-purple)" }}
        >
          Send
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onSwitchToManual}
          className="text-xs transition hover:underline"
          style={{ color: "var(--gray-text)" }}
        >
          Switch to manual setup
        </button>
        {projId && (
          <button
            type="button"
            onClick={handleDone}
            className="rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            style={{ backgroundColor: "var(--primary-blue)" }}
          >
            Open Project
          </button>
        )}
      </div>
    </div>
  );
};

/* ---- Template card ---- */

const TemplateCard = ({
  id, label, columns, icon, selected, onSelect,
}: { id: Template; label: string; columns: string[]; icon: React.ReactNode; selected: boolean; onSelect: () => void }) => (
  <button
    type="button"
    onClick={onSelect}
    className="w-full rounded-2xl border p-4 text-left transition hover:border-[var(--primary-blue)]"
    style={{
      borderColor: selected ? "var(--primary-blue)" : "var(--stroke)",
      backgroundColor: selected ? "rgba(32, 157, 215, 0.06)" : "var(--surface-strong)",
    }}
  >
    <div className="flex items-center gap-3 mb-2">
      <span className="text-lg">{icon}</span>
      <span className="font-display text-sm font-semibold" style={{ color: selected ? "var(--primary-blue)" : "var(--navy-dark)" }}>
        {label}
      </span>
    </div>
    <div className="flex flex-wrap gap-1.5">
      {columns.map((col) => (
        <span key={col} className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: "var(--surface)", color: "var(--gray-text)" }}>
          {col}
        </span>
      ))}
    </div>
  </button>
);

const TEMPLATE_ICONS: Record<Template, React.ReactNode> = {
  software: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--secondary-purple)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 7 3 10 7 13" /><polyline points="13 7 17 10 13 13" /><line x1="11" y1="5" x2="9" y2="15" /></svg>,
  marketing: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--accent-yellow)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 15 L3 8 L7 8 L7 15" /><path d="M8 15 L8 5 L12 5 L12 15" /><path d="M13 15 L13 2 L17 2 L17 15" /></svg>,
  simple: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--primary-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="5" height="14" rx="1" /><rect x="8" y="3" width="5" height="10" rx="1" /><rect x="14" y="3" width="5" height="6" rx="1" /></svg>,
  custom: <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--navy-dark)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="7" /><line x1="10" y1="7" x2="10" y2="13" /><line x1="7" y1="10" x2="13" y2="10" /></svg>,
};

/* ---- main component ---- */

export const ProjectWizard = ({ projectId, isNewProject, onComplete, onCancel }: Props) => {
  const [mode, setMode] = useState<Mode>("choose");

  // Step 1: Project name (only for new projects)
  // Step 2: Define workstreams
  // Step 3: Configure columns per workstream
  // Step 4: Review & create
  const showProjectNameStep = isNewProject && !projectId;
  const [step, setStep] = useState(showProjectNameStep ? 1 : 2);

  const [projectName, setProjectName] = useState("");
  const [workstreams, setWorkstreams] = useState<WorkstreamConfig[]>([
    { name: "", template: null, customColumns: ["", "", ""] },
  ]);
  const [activeWsIndex, setActiveWsIndex] = useState(0);
  const [creating, setCreating] = useState(false);

  const totalSteps = showProjectNameStep ? 4 : 3;

  /* ---- workstream helpers ---- */

  const addWorkstream = () => {
    if (workstreams.length < MAX_WORKSTREAMS) {
      setWorkstreams([...workstreams, { name: "", template: null, customColumns: ["", "", ""] }]);
    }
  };

  const removeWorkstream = (index: number) => {
    if (workstreams.length > 1) {
      const next = workstreams.filter((_, i) => i !== index);
      setWorkstreams(next);
      if (activeWsIndex >= next.length) setActiveWsIndex(next.length - 1);
    }
  };

  const updateWorkstream = (index: number, updates: Partial<WorkstreamConfig>) => {
    setWorkstreams(workstreams.map((ws, i) => (i === index ? { ...ws, ...updates } : ws)));
  };

  /* ---- column helpers for active workstream ---- */

  const activeWs = workstreams[activeWsIndex];

  const addColumn = () => {
    if (activeWs && activeWs.customColumns.length < MAX_COLUMNS) {
      updateWorkstream(activeWsIndex, {
        customColumns: [...activeWs.customColumns, ""],
      });
    }
  };

  const removeColumn = (colIndex: number) => {
    if (activeWs && activeWs.customColumns.length > MIN_COLUMNS) {
      updateWorkstream(activeWsIndex, {
        customColumns: activeWs.customColumns.filter((_, i) => i !== colIndex),
      });
    }
  };

  const updateColumn = (colIndex: number, value: string) => {
    if (activeWs) {
      updateWorkstream(activeWsIndex, {
        customColumns: activeWs.customColumns.map((c, i) => (i === colIndex ? value : c)),
      });
    }
  };

  /* ---- navigation ---- */

  const goNext = () => setStep((s) => Math.min(s + 1, showProjectNameStep ? 4 : 3 + 1));
  const goBack = () => {
    if (step === (showProjectNameStep ? 1 : 2) && mode === "manual") {
      setMode("choose");
    } else {
      setStep((s) => Math.max(s - 1, showProjectNameStep ? 1 : 2));
    }
  };

  /* ---- create ---- */

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      let pid = projectId;
      let pname = projectName.trim();

      // Create project if new
      if (!pid) {
        const proj = await api.createProject(pname);
        pid = proj.id;
        pname = proj.name;
      }

      // Batch create workstreams
      const wsDefs = workstreams.map((ws) => ({
        name: ws.name.trim(),
        columns: resolveColumns(ws).map((c) => c.trim()),
      }));

      await api.createProjectBoard(pid, wsDefs);
      onComplete({ projectId: pid, projectName: pname });
    } catch {
      setCreating(false);
    }
  };

  /* ---- validation ---- */

  const step1Valid = projectName.trim().length > 0;
  const step2Valid =
    workstreams.length > 0 && workstreams.every((ws) => ws.name.trim().length > 0);
  const step3Valid = workstreams.every((ws) => {
    if (ws.template && ws.template !== "custom") return true;
    return (
      ws.customColumns.length >= MIN_COLUMNS &&
      ws.customColumns.every((c) => c.trim().length > 0)
    );
  });

  const canProceed = (() => {
    if (showProjectNameStep) {
      if (step === 1) return step1Valid;
      if (step === 2) return step2Valid;
      if (step === 3) return step3Valid;
    } else {
      if (step === 2) return step2Valid;
      if (step === 3) return step3Valid;
    }
    return true;
  })();

  const reviewStep = showProjectNameStep ? 4 : 3 + 1;
  const isReviewStep = showProjectNameStep ? step === 4 : step === (3 + 1);
  // Actually, let's simplify: steps are 1(name?), 2(workstreams), 3(columns), 4(review) or 2,3,4
  const columnsStep = showProjectNameStep ? 3 : 3;
  const wsStep = showProjectNameStep ? 2 : 2;

  /* ---- step indicator ---- */

  const stepLabels = showProjectNameStep
    ? ["Project", "Workstreams", "Columns", "Review"]
    : ["Workstreams", "Columns", "Review"];
  const displayStepIndex = step - (showProjectNameStep ? 1 : 2);

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {stepLabels.map((label, i) => {
        const isActive = i === displayStepIndex;
        const isCompleted = i < displayStepIndex;
        return (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className="h-px w-8"
                style={{
                  backgroundColor: isCompleted ? "var(--primary-blue)" : "var(--stroke)",
                }}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors"
                style={{
                  backgroundColor: isActive || isCompleted ? "var(--primary-blue)" : "var(--surface)",
                  color: isActive || isCompleted ? "#ffffff" : "var(--gray-text)",
                  border: !isActive && !isCompleted ? "1px solid var(--stroke)" : "none",
                }}
              >
                {isCompleted ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2 7 5.5 10.5 12 3.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className="text-[10px] font-semibold" style={{ color: isActive ? "var(--primary-blue)" : "var(--gray-text)" }}>
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  const lastStep = showProjectNameStep ? 4 : 4;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(3, 33, 71, 0.45)" }} onClick={onCancel} />

      <div
        className="relative z-10 w-full rounded-3xl p-8 max-h-[90vh] overflow-y-auto"
        style={{
          maxWidth: mode === "ai" ? "560px" : "580px",
          backgroundColor: "var(--surface-strong)",
          boxShadow: "var(--shadow)",
        }}
      >
        {/* header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            {mode === "choose" && (
              <h2 className="font-display text-xl font-bold" style={{ color: "var(--navy-dark)" }}>
                {projectId ? "Add Workstreams" : "New Project"}
              </h2>
            )}
            {mode === "manual" && (
              <h2 className="font-display text-xl font-bold" style={{ color: "var(--navy-dark)" }}>
                {step === 1 && "Project Name"}
                {step === 2 && "Define Workstreams"}
                {step === 3 && "Configure Columns"}
                {step === 4 && "Review & Create"}
              </h2>
            )}
            {mode === "ai" && (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: "var(--gray-text)" }}>AI Assistant</p>
                <h2 className="mt-1 font-display text-xl font-bold" style={{ color: "var(--navy-dark)" }}>
                  Build Project with AI
                </h2>
              </>
            )}
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[var(--surface)]"
              style={{ color: "var(--gray-text)" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          )}
        </div>

        {/* mode: choose */}
        {mode === "choose" && (
          <div className="space-y-3">
            <p className="text-sm mb-4" style={{ color: "var(--gray-text)" }}>
              How would you like to set up your project?
            </p>
            <button
              type="button"
              onClick={() => setMode("manual")}
              className="w-full rounded-2xl border p-5 text-left transition hover:border-[var(--primary-blue)] hover:bg-[rgba(32,157,215,0.03)]"
              style={{ borderColor: "var(--stroke)", backgroundColor: "var(--surface-strong)" }}
            >
              <div className="flex items-center gap-3 mb-1.5">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--primary-blue)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="5" height="14" rx="1" />
                  <rect x="8" y="3" width="5" height="10" rx="1" />
                  <rect x="14" y="3" width="5" height="6" rx="1" />
                </svg>
                <span className="font-display text-sm font-semibold" style={{ color: "var(--navy-dark)" }}>
                  Manual Setup
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--gray-text)" }}>
                Define workstreams and configure columns for each one.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode("ai")}
              className="w-full rounded-2xl border p-5 text-left transition hover:border-[var(--secondary-purple)] hover:bg-[rgba(117,57,145,0.03)]"
              style={{ borderColor: "var(--stroke)", backgroundColor: "var(--surface-strong)" }}
            >
              <div className="flex items-center gap-3 mb-1.5">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--secondary-purple)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="8" />
                  <path d="M7 10 L9 12 L13 8" />
                </svg>
                <span className="font-display text-sm font-semibold" style={{ color: "var(--navy-dark)" }}>
                  Build with AI Chat
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--gray-text)" }}>
                Describe your project and the AI will design the full board with workstreams, columns, and cards.
              </p>
            </button>

            {onCancel && (
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-full border px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition hover:text-[var(--navy-dark)]"
                  style={{ borderColor: "var(--stroke)", color: "var(--gray-text)" }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* mode: ai */}
        {mode === "ai" && (
          <AIBoardChat
            projectId={projectId}
            onComplete={onComplete}
            onSwitchToManual={() => setMode("manual")}
          />
        )}

        {/* mode: manual */}
        {mode === "manual" && (
          <>
            <StepIndicator />

            {/* Step 1: Project name (new projects only) */}
            {step === 1 && showProjectNameStep && (
              <div className="space-y-5">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--gray-text)" }}>
                    Project Name
                  </label>
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g. LLC Formation"
                    className="w-full rounded-xl border bg-white px-4 py-2.5 text-sm font-medium outline-none transition focus:border-[var(--primary-blue)]"
                    style={{ borderColor: "var(--stroke)", color: "var(--navy-dark)" }}
                    autoFocus
                  />
                </div>
              </div>
            )}

            {/* Step 2: Define workstreams */}
            {step === 2 && (
              <div className="space-y-4">
                <p className="text-sm" style={{ color: "var(--gray-text)" }}>
                  Add the workstreams for your project. Each workstream will have its own set of columns.
                </p>
                <div className="space-y-3">
                  {workstreams.map((ws, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: "var(--primary-blue)" }}
                      >
                        {i + 1}
                      </span>
                      <input
                        value={ws.name}
                        onChange={(e) => updateWorkstream(i, { name: e.target.value })}
                        placeholder={`Workstream ${i + 1} name`}
                        className="flex-1 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium outline-none transition focus:border-[var(--primary-blue)]"
                        style={{ borderColor: "var(--stroke)", color: "var(--navy-dark)" }}
                        autoFocus={i === workstreams.length - 1}
                      />
                      {workstreams.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeWorkstream(i)}
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition hover:bg-[var(--surface)]"
                          style={{ color: "var(--gray-text)" }}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="3" y1="7" x2="11" y2="7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {workstreams.length < MAX_WORKSTREAMS && (
                  <button
                    type="button"
                    onClick={addWorkstream}
                    className="w-full rounded-full border border-dashed px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition hover:border-[var(--primary-blue)]"
                    style={{ borderColor: "var(--stroke)", color: "var(--primary-blue)" }}
                  >
                    + Add Workstream
                  </button>
                )}
              </div>
            )}

            {/* Step 3: Configure columns per workstream */}
            {step === 3 && (
              <div className="space-y-5">
                {/* Workstream selector tabs */}
                {workstreams.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {workstreams.map((ws, i) => {
                      const isActive = i === activeWsIndex;
                      const hasTemplate = ws.template !== null;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setActiveWsIndex(i)}
                          className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                            isActive
                              ? "bg-[var(--primary-blue)] text-white shadow-sm"
                              : "border border-[var(--stroke)] text-[var(--gray-text)] hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                          }`}
                        >
                          {ws.name || `WS ${i + 1}`}
                          {hasTemplate && !isActive && (
                            <svg className="ml-1.5 inline" width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="2 7 5.5 10.5 12 3.5" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div>
                  <p className="text-sm mb-4" style={{ color: "var(--gray-text)" }}>
                    Choose a column template for <strong style={{ color: "var(--navy-dark)" }}>{activeWs?.name || `Workstream ${activeWsIndex + 1}`}</strong>
                  </p>

                  {/* Templates */}
                  <div className="space-y-3">
                    {(Object.keys(TEMPLATES) as Exclude<Template, "custom">[]).map((key) => (
                      <TemplateCard
                        key={key}
                        id={key}
                        label={TEMPLATES[key].label}
                        columns={TEMPLATES[key].columns}
                        icon={TEMPLATE_ICONS[key]}
                        selected={activeWs?.template === key}
                        onSelect={() => updateWorkstream(activeWsIndex, { template: key })}
                      />
                    ))}
                    <TemplateCard
                      id="custom"
                      label="Custom"
                      columns={["You decide"]}
                      icon={TEMPLATE_ICONS.custom}
                      selected={activeWs?.template === "custom"}
                      onSelect={() => updateWorkstream(activeWsIndex, { template: "custom" })}
                    />
                  </div>

                  {/* Custom columns editor */}
                  {activeWs?.template === "custom" && (
                    <div className="mt-5 space-y-3">
                      <p className="text-sm" style={{ color: "var(--gray-text)" }}>
                        Define columns (min {MIN_COLUMNS}, max {MAX_COLUMNS}):
                      </p>
                      <div className="space-y-2.5">
                        {activeWs.customColumns.map((col, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              value={col}
                              onChange={(e) => updateColumn(i, e.target.value)}
                              placeholder={`Column ${i + 1}`}
                              className="flex-1 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium outline-none transition focus:border-[var(--primary-blue)]"
                              style={{ borderColor: "var(--stroke)", color: "var(--navy-dark)" }}
                            />
                            <button
                              type="button"
                              onClick={() => removeColumn(i)}
                              disabled={activeWs.customColumns.length <= MIN_COLUMNS}
                              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition hover:bg-[var(--surface)] disabled:opacity-30 disabled:cursor-not-allowed"
                              style={{ color: "var(--gray-text)" }}
                            >
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="3" y1="7" x2="11" y2="7" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                      {activeWs.customColumns.length < MAX_COLUMNS && (
                        <button
                          type="button"
                          onClick={addColumn}
                          className="w-full rounded-full border border-dashed px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition hover:border-[var(--primary-blue)]"
                          style={{ borderColor: "var(--stroke)", color: "var(--primary-blue)" }}
                        >
                          + Add Column
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="rounded-2xl p-5 space-y-5" style={{ backgroundColor: "var(--surface)" }}>
                  {showProjectNameStep && (
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--gray-text)" }}>
                        Project
                      </span>
                      <span className="font-display text-base font-bold" style={{ color: "var(--navy-dark)" }}>
                        {projectName.trim()}
                      </span>
                    </div>
                  )}

                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--gray-text)" }}>
                      Workstreams ({workstreams.length})
                    </span>
                    <div className="space-y-4">
                      {workstreams.map((ws, i) => (
                        <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "var(--surface-strong)", border: "1px solid var(--stroke)" }}>
                          <span className="font-display text-sm font-bold" style={{ color: "var(--navy-dark)" }}>
                            {ws.name.trim()}
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {resolveColumns(ws).map((col, j) => (
                              <span key={j} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                                style={{ backgroundColor: "var(--surface)", color: "var(--navy-dark)", border: "1px solid var(--stroke)" }}>
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--primary-blue)" }} />
                                {col.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* footer */}
            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={goBack}
                className="rounded-full border px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition hover:text-[var(--navy-dark)]"
                style={{ borderColor: "var(--stroke)", color: "var(--gray-text)" }}
              >
                Back
              </button>

              <div className="flex items-center gap-3">
                {step < 4 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!canProceed}
                    className="rounded-full px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ backgroundColor: "var(--primary-blue)" }}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    className="rounded-full px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
                    style={{ backgroundColor: "var(--secondary-purple)" }}
                  >
                    {creating ? "Creating..." : "Create Project"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
