"use client";

import { useState } from "react";

type ProjectWizardProps = {
  onComplete: (name: string, columns: string[]) => void;
  onCancel: () => void;
};

type Template = {
  id: string;
  label: string;
  columns: string[];
  icon: React.ReactNode;
};

const templates: Template[] = [
  {
    id: "software",
    label: "Software Development",
    columns: ["Backlog", "In Progress", "Review", "Testing", "Done"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: "marketing",
    label: "Marketing Campaign",
    columns: ["Ideas", "Planning", "In Progress", "Review", "Published"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="12" width="4" height="9" rx="1" />
        <rect x="10" y="7" width="4" height="14" rx="1" />
        <rect x="17" y="3" width="4" height="18" rx="1" />
      </svg>
    ),
  },
  {
    id: "simple",
    label: "Simple Kanban",
    columns: ["To Do", "In Progress", "Done"],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="6" height="18" rx="2" />
        <rect x="9" y="3" width="6" height="18" rx="2" />
        <rect x="16" y="3" width="6" height="18" rx="2" />
      </svg>
    ),
  },
  {
    id: "custom",
    label: "Custom",
    columns: [],
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
];

const MAX_COLUMNS = 8;
const MIN_COLUMNS = 2;

export const ProjectWizard = ({ onComplete, onCancel }: ProjectWizardProps) => {
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customColumns, setCustomColumns] = useState(["", "", ""]);

  const selectedTemplateDef = templates.find((t) => t.id === selectedTemplate);

  const resolvedColumns =
    selectedTemplate === "custom"
      ? customColumns.filter((c) => c.trim() !== "")
      : selectedTemplateDef?.columns ?? [];

  const canProceedStep1 = projectName.trim() !== "" && selectedTemplate !== null;

  const canProceedStep2 =
    customColumns.filter((c) => c.trim() !== "").length >= MIN_COLUMNS;

  const handleNext = () => {
    if (step === 1) {
      if (selectedTemplate === "custom") {
        setStep(2);
      } else {
        setStep(3);
      }
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(selectedTemplate === "custom" ? 2 : 1);
    } else if (step === 2) {
      setStep(1);
    }
  };

  const handleCreate = () => {
    onComplete(projectName.trim(), resolvedColumns);
  };

  const handleAddColumn = () => {
    if (customColumns.length < MAX_COLUMNS) {
      setCustomColumns([...customColumns, ""]);
    }
  };

  const handleRemoveColumn = (index: number) => {
    if (customColumns.length > MIN_COLUMNS) {
      setCustomColumns(customColumns.filter((_, i) => i !== index));
    }
  };

  const handleColumnChange = (index: number, value: string) => {
    const updated = [...customColumns];
    updated[index] = value;
    setCustomColumns(updated);
  };

  const stepLabels = ["Details", "Columns", "Review"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(3, 33, 71, 0.55)" }}
    >
      <div
        className="w-full max-w-lg rounded-3xl p-8"
        style={{
          backgroundColor: "var(--surface-strong)",
          boxShadow: "var(--shadow)",
        }}
      >
        {/* Step Indicator */}
        <div className="mb-8 flex items-center justify-center gap-0">
          {stepLabels.map((label, i) => {
            const stepNum = i + 1;
            const isActive = step === stepNum;
            const isCompleted = step > stepNum;
            return (
              <div key={label} className="flex items-center">
                {i > 0 && (
                  <div
                    className="mx-2 h-0.5 w-10"
                    style={{
                      backgroundColor: isCompleted
                        ? "var(--primary-blue)"
                        : "var(--stroke)",
                    }}
                  />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: isActive || isCompleted
                        ? "var(--primary-blue)"
                        : "var(--surface)",
                      color: isActive || isCompleted
                        ? "#ffffff"
                        : "var(--gray-text)",
                      border:
                        !isActive && !isCompleted
                          ? "2px solid var(--stroke)"
                          : "none",
                    }}
                  >
                    {isCompleted ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2 7 5.5 10.5 12 3.5" />
                      </svg>
                    ) : (
                      stepNum
                    )}
                  </div>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      color: isActive
                        ? "var(--primary-blue)"
                        : "var(--gray-text)",
                    }}
                  >
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step 1: Project Details */}
        {step === 1 && (
          <div>
            <h2
              className="font-display mb-1 text-xl font-bold"
              style={{ color: "var(--navy-dark)" }}
            >
              Create a new project
            </h2>
            <p
              className="mb-6 text-sm"
              style={{ color: "var(--gray-text)" }}
            >
              Choose a name and a template to get started.
            </p>

            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--navy-dark)" }}
            >
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Q2 Product Launch"
              className="mb-6 w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors"
              style={{
                borderColor: "var(--stroke)",
                backgroundColor: "var(--surface)",
                color: "var(--navy-dark)",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--primary-blue)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--stroke)")
              }
            />

            <label
              className="mb-3 block text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--navy-dark)" }}
            >
              Template
            </label>
            <div className="grid grid-cols-2 gap-3">
              {templates.map((t) => {
                const isSelected = selectedTemplate === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTemplate(t.id)}
                    className="flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors"
                    style={{
                      borderColor: isSelected
                        ? "var(--primary-blue)"
                        : "var(--stroke)",
                      backgroundColor: isSelected
                        ? "rgba(32, 157, 215, 0.08)"
                        : "var(--surface-strong)",
                      color: isSelected
                        ? "var(--primary-blue)"
                        : "var(--navy-dark)",
                    }}
                  >
                    <span
                      style={{
                        color: isSelected
                          ? "var(--primary-blue)"
                          : "var(--gray-text)",
                      }}
                    >
                      {t.icon}
                    </span>
                    <span className="text-sm font-semibold">{t.label}</span>
                    {t.columns.length > 0 && (
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--gray-text)" }}
                      >
                        {t.columns.join(" → ")}
                      </span>
                    )}
                    {t.id === "custom" && (
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--gray-text)" }}
                      >
                        Define your own columns
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--gray-text)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceedStep1}
                className="rounded-full px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "var(--primary-blue)" }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Column Configuration */}
        {step === 2 && (
          <div>
            <h2
              className="font-display mb-1 text-xl font-bold"
              style={{ color: "var(--navy-dark)" }}
            >
              Configure columns
            </h2>
            <p
              className="mb-6 text-sm"
              style={{ color: "var(--gray-text)" }}
            >
              Add between {MIN_COLUMNS} and {MAX_COLUMNS} columns for your
              board.
            </p>

            <div className="flex flex-col gap-3">
              {customColumns.map((col, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={col}
                    onChange={(e) => handleColumnChange(i, e.target.value)}
                    placeholder={`Column ${i + 1}`}
                    className="flex-1 rounded-xl border px-4 py-3 text-sm outline-none transition-colors"
                    style={{
                      borderColor: "var(--stroke)",
                      backgroundColor: "var(--surface)",
                      color: "var(--navy-dark)",
                    }}
                    onFocus={(e) =>
                      (e.currentTarget.style.borderColor =
                        "var(--primary-blue)")
                    }
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = "var(--stroke)")
                    }
                  />
                  {customColumns.length > MIN_COLUMNS && (
                    <button
                      type="button"
                      onClick={() => handleRemoveColumn(i)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors hover:bg-red-50"
                      style={{
                        borderColor: "var(--stroke)",
                        color: "var(--gray-text)",
                      }}
                      aria-label={`Remove column ${i + 1}`}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="4" y1="8" x2="12" y2="8" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {customColumns.length < MAX_COLUMNS && (
              <button
                type="button"
                onClick={handleAddColumn}
                className="mt-4 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors"
                style={{
                  color: "var(--primary-blue)",
                  backgroundColor: "rgba(32, 157, 215, 0.08)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="7" y1="2" x2="7" y2="12" />
                  <line x1="2" y1="7" x2="12" y2="7" />
                </svg>
                Add Column
              </button>
            )}

            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--gray-text)" }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceedStep2}
                className="rounded-full px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "var(--primary-blue)" }}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Create */}
        {step === 3 && (
          <div>
            <h2
              className="font-display mb-1 text-xl font-bold"
              style={{ color: "var(--navy-dark)" }}
            >
              Review your project
            </h2>
            <p
              className="mb-6 text-sm"
              style={{ color: "var(--gray-text)" }}
            >
              Everything look good? Hit create to get started.
            </p>

            <div
              className="mb-4 rounded-xl border p-5"
              style={{
                borderColor: "var(--stroke)",
                backgroundColor: "var(--surface)",
              }}
            >
              <span
                className="mb-1 block text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--gray-text)" }}
              >
                Project Name
              </span>
              <span
                className="font-display text-lg font-bold"
                style={{ color: "var(--navy-dark)" }}
              >
                {projectName}
              </span>
            </div>

            <div
              className="rounded-xl border p-5"
              style={{
                borderColor: "var(--stroke)",
                backgroundColor: "var(--surface)",
              }}
            >
              <span
                className="mb-3 block text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--gray-text)" }}
              >
                Columns
              </span>
              <div className="flex flex-wrap gap-2">
                {resolvedColumns.map((col) => (
                  <span
                    key={col}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: "rgba(32, 157, 215, 0.08)",
                      color: "var(--primary-blue)",
                    }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: "var(--primary-blue)" }}
                    />
                    {col}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <button
                type="button"
                onClick={handleBack}
                className="rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--gray-text)" }}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="rounded-full px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition-opacity"
                style={{ backgroundColor: "var(--primary-blue)" }}
              >
                Create Project
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
