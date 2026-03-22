"use client";

import { useState } from "react";
import type { ProjectConfig } from "@/lib/storage";

type Props = {
  onComplete: (config: ProjectConfig) => void;
  onCancel?: () => void;
};

type Template = "software" | "marketing" | "simple" | "custom";

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

export const ProjectWizard = ({ onComplete, onCancel }: Props) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [customColumns, setCustomColumns] = useState<string[]>(["", "", ""]);

  const totalSteps = template === "custom" ? 3 : 2;

  const resolvedColumns =
    template && template !== "custom"
      ? TEMPLATES[template].columns
      : customColumns;

  /* ---- navigation ---- */

  const goNext = () => {
    if (step === 1) {
      if (template === "custom") {
        setStep(2);
      } else {
        // skip to review (step 3 internally, but displayed as step 2 for non-custom)
        setStep(3);
      }
    } else if (step === 2) {
      setStep(3);
    }
  };

  const goBack = () => {
    if (step === 3) {
      setStep(template === "custom" ? 2 : 1);
    } else if (step === 2) {
      setStep(1);
    }
  };

  /* ---- custom columns helpers ---- */

  const addColumn = () => {
    if (customColumns.length < MAX_COLUMNS) {
      setCustomColumns([...customColumns, ""]);
    }
  };

  const removeColumn = (index: number) => {
    if (customColumns.length > MIN_COLUMNS) {
      setCustomColumns(customColumns.filter((_, i) => i !== index));
    }
  };

  const updateColumn = (index: number, value: string) => {
    setCustomColumns(customColumns.map((c, i) => (i === index ? value : c)));
  };

  /* ---- create ---- */

  const handleCreate = () => {
    const config: ProjectConfig = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      columns: resolvedColumns.map((title, i) => ({
        id: `col-${i}`,
        title: title.trim(),
      })),
      createdAt: new Date().toISOString(),
    };
    onComplete(config);
  };

  /* ---- validation ---- */

  const step1Valid = name.trim().length > 0 && template !== null;
  const step2Valid =
    customColumns.length >= MIN_COLUMNS &&
    customColumns.every((c) => c.trim().length > 0);

  const canProceed =
    (step === 1 && step1Valid) ||
    (step === 2 && step2Valid) ||
    step === 3;

  /* ---- step indicator ---- */

  const displayStep = step === 3 ? totalSteps : step;

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }, (_, i) => {
        const s = i + 1;
        const isActive = s === displayStep;
        const isCompleted = s < displayStep;
        return (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className="h-px w-8"
                style={{
                  backgroundColor: isCompleted
                    ? "var(--primary-blue)"
                    : "var(--stroke)",
                }}
              />
            )}
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors"
              style={{
                backgroundColor: isActive
                  ? "var(--primary-blue)"
                  : isCompleted
                    ? "var(--primary-blue)"
                    : "var(--surface)",
                color: isActive || isCompleted ? "#ffffff" : "var(--gray-text)",
                border:
                  !isActive && !isCompleted
                    ? "1px solid var(--stroke)"
                    : "none",
              }}
            >
              {isCompleted ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="2 7 5.5 10.5 12 3.5" />
                </svg>
              ) : (
                s
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  /* ---- template card ---- */

  const TemplateCard = ({
    id,
    label,
    columns,
    icon,
  }: {
    id: Template;
    label: string;
    columns: string[];
    icon: React.ReactNode;
  }) => {
    const selected = template === id;
    return (
      <button
        type="button"
        onClick={() => setTemplate(id)}
        className="w-full rounded-2xl border p-4 text-left transition hover:border-[var(--primary-blue)]"
        style={{
          borderColor: selected ? "var(--primary-blue)" : "var(--stroke)",
          backgroundColor: selected
            ? "rgba(32, 157, 215, 0.06)"
            : "var(--surface-strong)",
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          <span className="text-lg">{icon}</span>
          <span
            className="font-display text-sm font-semibold"
            style={{
              color: selected ? "var(--primary-blue)" : "var(--navy-dark)",
            }}
          >
            {label}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {columns.map((col) => (
            <span
              key={col}
              className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                backgroundColor: "var(--surface)",
                color: "var(--gray-text)",
              }}
            >
              {col}
            </span>
          ))}
        </div>
      </button>
    );
  };

  /* ---- render ---- */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(3, 33, 71, 0.45)" }}
        onClick={onCancel}
      />

      {/* card */}
      <div
        className="relative z-10 w-full max-w-lg rounded-3xl p-8"
        style={{
          backgroundColor: "var(--surface-strong)",
          boxShadow: "var(--shadow)",
        }}
      >
        {/* header */}
        <div className="flex items-center justify-between mb-2">
          <h2
            className="font-display text-xl font-bold"
            style={{ color: "var(--navy-dark)" }}
          >
            {step === 1 && "Create Project"}
            {step === 2 && "Configure Columns"}
            {step === 3 && "Review & Create"}
          </h2>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[var(--surface)]"
              style={{ color: "var(--gray-text)" }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          )}
        </div>

        <StepIndicator />

        {/* step 1: project details */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--gray-text)" }}
              >
                Project Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Awesome Project"
                className="w-full rounded-xl border bg-white px-4 py-2.5 text-sm font-medium outline-none transition focus:border-[var(--primary-blue)]"
                style={{
                  borderColor: "var(--stroke)",
                  color: "var(--navy-dark)",
                }}
                required
              />
            </div>

            <div>
              <label
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--gray-text)" }}
              >
                Description{" "}
                <span className="normal-case tracking-normal font-normal">
                  (optional)
                </span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of your project..."
                rows={2}
                className="w-full resize-none rounded-xl border bg-white px-4 py-2.5 text-sm outline-none transition focus:border-[var(--primary-blue)]"
                style={{
                  borderColor: "var(--stroke)",
                  color: "var(--navy-dark)",
                }}
              />
            </div>

            <div>
              <label
                className="mb-3 block text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--gray-text)" }}
              >
                Choose a Template
              </label>
              <div className="space-y-3">
                <TemplateCard
                  id="software"
                  label="Software Development"
                  columns={TEMPLATES.software.columns}
                  icon={
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="var(--secondary-purple)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="7 7 3 10 7 13" />
                      <polyline points="13 7 17 10 13 13" />
                      <line x1="11" y1="5" x2="9" y2="15" />
                    </svg>
                  }
                />
                <TemplateCard
                  id="marketing"
                  label="Marketing Campaign"
                  columns={TEMPLATES.marketing.columns}
                  icon={
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="var(--accent-yellow)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 15 L3 8 L7 8 L7 15" />
                      <path d="M8 15 L8 5 L12 5 L12 15" />
                      <path d="M13 15 L13 2 L17 2 L17 15" />
                    </svg>
                  }
                />
                <TemplateCard
                  id="simple"
                  label="Simple Kanban"
                  columns={TEMPLATES.simple.columns}
                  icon={
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="var(--primary-blue)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="2" y="3" width="5" height="14" rx="1" />
                      <rect x="8" y="3" width="5" height="10" rx="1" />
                      <rect x="14" y="3" width="5" height="6" rx="1" />
                    </svg>
                  }
                />
                <TemplateCard
                  id="custom"
                  label="Custom"
                  columns={["You decide"]}
                  icon={
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="var(--navy-dark)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="10" cy="10" r="7" />
                      <line x1="10" y1="7" x2="10" y2="13" />
                      <line x1="7" y1="10" x2="13" y2="10" />
                    </svg>
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* step 2: column configuration */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--gray-text)" }}>
              Define your board columns. You can add up to {MAX_COLUMNS} columns
              (minimum {MIN_COLUMNS}).
            </p>

            <div className="space-y-2.5">
              {customColumns.map((col, i) => (
                <div key={i} className="flex items-center gap-2">
                  {/* drag handle (visual only) */}
                  <span
                    className="flex-shrink-0 cursor-grab"
                    style={{ color: "var(--gray-text)" }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <circle cx="6" cy="4" r="1.2" />
                      <circle cx="10" cy="4" r="1.2" />
                      <circle cx="6" cy="8" r="1.2" />
                      <circle cx="10" cy="8" r="1.2" />
                      <circle cx="6" cy="12" r="1.2" />
                      <circle cx="10" cy="12" r="1.2" />
                    </svg>
                  </span>

                  <input
                    value={col}
                    onChange={(e) => updateColumn(i, e.target.value)}
                    placeholder={`Column ${i + 1}`}
                    className="flex-1 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium outline-none transition focus:border-[var(--primary-blue)]"
                    style={{
                      borderColor: "var(--stroke)",
                      color: "var(--navy-dark)",
                    }}
                    required
                  />

                  <button
                    type="button"
                    onClick={() => removeColumn(i)}
                    disabled={customColumns.length <= MIN_COLUMNS}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition hover:bg-[var(--surface)] disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ color: "var(--gray-text)" }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <line x1="3" y1="7" x2="11" y2="7" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {customColumns.length < MAX_COLUMNS && (
              <button
                type="button"
                onClick={addColumn}
                className="w-full rounded-full border border-dashed px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition hover:border-[var(--primary-blue)]"
                style={{
                  borderColor: "var(--stroke)",
                  color: "var(--primary-blue)",
                }}
              >
                + Add Column
              </button>
            )}
          </div>
        )}

        {/* step 3: review */}
        {step === 3 && (
          <div className="space-y-5">
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{ backgroundColor: "var(--surface)" }}
            >
              <div>
                <span
                  className="block text-[10px] font-semibold uppercase tracking-wide mb-1"
                  style={{ color: "var(--gray-text)" }}
                >
                  Project Name
                </span>
                <span
                  className="font-display text-base font-bold"
                  style={{ color: "var(--navy-dark)" }}
                >
                  {name.trim()}
                </span>
              </div>

              {description.trim() && (
                <div>
                  <span
                    className="block text-[10px] font-semibold uppercase tracking-wide mb-1"
                    style={{ color: "var(--gray-text)" }}
                  >
                    Description
                  </span>
                  <span className="text-sm" style={{ color: "var(--navy-dark)" }}>
                    {description.trim()}
                  </span>
                </div>
              )}

              <div>
                <span
                  className="block text-[10px] font-semibold uppercase tracking-wide mb-2"
                  style={{ color: "var(--gray-text)" }}
                >
                  Columns
                </span>
                <div className="flex flex-wrap gap-2">
                  {resolvedColumns.map((col, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                      style={{
                        backgroundColor: "var(--surface-strong)",
                        color: "var(--navy-dark)",
                        border: "1px solid var(--stroke)",
                      }}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: "var(--primary-blue)" }}
                      />
                      {col.trim()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* footer buttons */}
        <div className="mt-8 flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-full border px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition hover:text-[var(--navy-dark)]"
                style={{
                  borderColor: "var(--stroke)",
                  color: "var(--gray-text)",
                }}
              >
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {onCancel && step === 1 && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border px-5 py-2.5 text-xs font-semibold uppercase tracking-wide transition hover:text-[var(--navy-dark)]"
                style={{
                  borderColor: "var(--stroke)",
                  color: "var(--gray-text)",
                }}
              >
                Cancel
              </button>
            )}

            {step < 3 ? (
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
                className="rounded-full px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
                style={{ backgroundColor: "var(--secondary-purple)" }}
              >
                Create Project
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
