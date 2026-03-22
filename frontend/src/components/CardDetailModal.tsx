"use client";

import { useState } from "react";
import type { Card, Column, Subtask } from "@/lib/kanban";

type CardDetailModalProps = {
  card: Card;
  columns: Column[];
  onSave: (
    cardId: string,
    fields: {
      title?: string;
      details?: string;
      priority?: string;
      notes?: string;
      due_date?: string;
      subtasks?: Subtask[];
    }
  ) => void;
  onDelete: (cardId: string) => void;
  onClose: () => void;
};

const PRIORITIES: { value: string; label: string; color: string }[] = [
  { value: "high", label: "High", color: "#ef4444" },
  { value: "medium", label: "Medium", color: "#ecad0a" },
  { value: "low", label: "Low", color: "#209dd7" },
  { value: "none", label: "None", color: "#888888" },
];

export const CardDetailModal = ({
  card,
  columns,
  onSave,
  onDelete,
  onClose,
}: CardDetailModalProps) => {
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.notes ?? "");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleTitleBlur = () => {
    if (title.trim() && title !== card.title) {
      onSave(card.id, { title: title.trim() });
    }
  };

  const handleNotesBlur = () => {
    if (notes !== (card.notes ?? "")) {
      onSave(card.id, { notes });
    }
  };

  const handlePriorityChange = (priority: string) => {
    onSave(card.id, { priority });
  };

  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSave(card.id, { due_date: e.target.value || "" });
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const newSubtask: Subtask = {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: newSubtaskTitle.trim(),
      done: false,
    };
    const updated = [...(card.subtasks ?? []), newSubtask];
    onSave(card.id, { subtasks: updated });
    setNewSubtaskTitle("");
  };

  const handleSubtaskToggle = (subtaskId: string) => {
    const updated = (card.subtasks ?? []).map((s) =>
      s.id === subtaskId ? { ...s, done: !s.done } : s
    );
    onSave(card.id, { subtasks: updated });
  };

  const handleSubtaskDelete = (subtaskId: string) => {
    const updated = (card.subtasks ?? []).filter((s) => s.id !== subtaskId);
    onSave(card.id, { subtasks: updated });
  };

  const handleDeleteCard = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDelete(card.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(3, 33, 71, 0.45)" }}
        onClick={onClose}
        data-testid="modal-backdrop"
      />

      {/* modal */}
      <div
        className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl p-8"
        style={{
          backgroundColor: "var(--surface-strong)",
          boxShadow: "var(--shadow)",
        }}
        data-testid="card-detail-modal"
      >
        {/* close button */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
            Card Details
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[var(--surface)]"
            style={{ color: "var(--gray-text)" }}
            aria-label="Close"
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
        </div>

        <div className="space-y-6">
          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              className="w-full rounded-xl border border-[var(--stroke)] bg-white px-4 py-2.5 font-display text-base font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              data-testid="card-title-input"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Priority
            </label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => {
                const isActive = (card.priority ?? "none") === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => handlePriorityChange(p.value)}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold transition"
                    style={{
                      backgroundColor: isActive ? p.color : "var(--surface)",
                      color: isActive ? "#ffffff" : "var(--gray-text)",
                      border: isActive
                        ? "none"
                        : "1px solid var(--stroke)",
                    }}
                    data-testid={`priority-${p.value}`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Add notes..."
              rows={3}
              className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-4 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              data-testid="card-notes-input"
            />
          </div>

          {/* Due Date */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Due Date
            </label>
            <input
              type="date"
              value={card.dueDate ?? ""}
              onChange={handleDueDateChange}
              className="w-full rounded-xl border border-[var(--stroke)] bg-white px-4 py-2.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              data-testid="card-due-date-input"
            />
          </div>

          {/* Subtasks */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Subtasks
            </label>
            <div className="space-y-2">
              {(card.subtasks ?? []).map((subtask) => (
                <div
                  key={subtask.id}
                  className="flex items-center gap-2 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={subtask.done}
                    onChange={() => handleSubtaskToggle(subtask.id)}
                    className="h-4 w-4 rounded accent-[var(--primary-blue)]"
                    data-testid={`subtask-check-${subtask.id}`}
                  />
                  <span
                    className={`flex-1 text-sm ${
                      subtask.done
                        ? "text-[var(--gray-text)] line-through"
                        : "text-[var(--navy-dark)]"
                    }`}
                  >
                    {subtask.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSubtaskDelete(subtask.id)}
                    className="text-xs font-semibold text-[var(--gray-text)] transition hover:text-red-500"
                    aria-label={`Delete subtask ${subtask.title}`}
                    data-testid={`subtask-delete-${subtask.id}`}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <line x1="2" y1="2" x2="10" y2="10" />
                      <line x1="10" y1="2" x2="2" y2="10" />
                    </svg>
                  </button>
                </div>
              ))}

              {/* Add subtask */}
              <div className="flex items-center gap-2">
                <input
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSubtask();
                    }
                  }}
                  placeholder="Add a subtask..."
                  className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  data-testid="subtask-input"
                />
                <button
                  type="button"
                  onClick={handleAddSubtask}
                  disabled={!newSubtaskTitle.trim()}
                  className="rounded-full bg-[var(--primary-blue)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                  data-testid="subtask-add-btn"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Delete Card */}
          <div className="border-t border-[var(--stroke)] pt-6">
            <button
              type="button"
              onClick={handleDeleteCard}
              className="rounded-full px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
              style={{ backgroundColor: confirmingDelete ? "#dc2626" : "#ef4444" }}
              data-testid="delete-card-btn"
            >
              {confirmingDelete ? "Confirm Delete" : "Delete Card"}
            </button>
            {confirmingDelete && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="ml-3 rounded-full border border-[var(--stroke)] px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
