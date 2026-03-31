"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { CardDetailModal } from "@/components/CardDetailModal";
import { moveCard, type Card, type ProjectBoardData, type WorkstreamData } from "@/lib/kanban";
import * as api from "@/lib/api";

const WORKSTREAM_COLORS = [
  "var(--primary-blue)",
  "var(--secondary-purple)",
  "var(--accent-yellow)",
  "#ef4444",
  "#22c55e",
  "#f97316",
];

type ProjectBoardProps = {
  projectId: number;
  projectBoard: ProjectBoardData;
  onProjectBoardChange: (board: ProjectBoardData) => void;
  onProjectNameChange?: (name: string) => void;
  isSample?: boolean;
};

export const ProjectBoard = ({
  projectId,
  projectBoard,
  onProjectBoardChange,
  onProjectNameChange,
  isSample,
}: ProjectBoardProps) => {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeWsId, setActiveWsId] = useState<number | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectedWsId, setSelectedWsId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectBoard.project_name);

  // Currently viewed workstream
  const [currentWsId, setCurrentWsId] = useState<number | null>(
    projectBoard.workstreams[0]?.id ?? null
  );

  // Keep currentWsId in sync if workstreams change (e.g. new one added)
  useEffect(() => {
    if (currentWsId == null && projectBoard.workstreams.length > 0) {
      setCurrentWsId(projectBoard.workstreams[0].id);
    }
    // If current was removed, fall back to first
    if (currentWsId != null && !projectBoard.workstreams.some((ws) => ws.id === currentWsId)) {
      setCurrentWsId(projectBoard.workstreams[0]?.id ?? null);
    }
  }, [projectBoard.workstreams, currentWsId]);

  // Keep nameInput in sync when projectBoard changes (e.g. after AI rename)
  useEffect(() => {
    setNameInput(projectBoard.project_name);
    setEditingName(false);
  }, [projectBoard.project_name]);

  const handleRenameSave = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === projectBoard.project_name || isSample) {
      setEditingName(false);
      setNameInput(projectBoard.project_name);
      return;
    }
    try {
      await api.updateProject(projectId, trimmed);
      onProjectBoardChange({ ...projectBoard, project_name: trimmed });
      onProjectNameChange?.(trimmed);
    } catch {
      setNameInput(projectBoard.project_name);
    }
    setEditingName(false);
  };

  // Inline add workstream
  const [showAddWs, setShowAddWs] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [creatingWs, setCreatingWs] = useState(false);

  // Inline add column
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [creatingColumn, setCreatingColumn] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const currentWs = projectBoard.workstreams.find((ws) => ws.id === currentWsId) ?? null;
  const currentWsIndex = projectBoard.workstreams.findIndex((ws) => ws.id === currentWsId);

  const updateWorkstream = useCallback(
    (wsId: number, updater: (ws: WorkstreamData) => WorkstreamData) => {
      onProjectBoardChange({
        ...projectBoard,
        workstreams: projectBoard.workstreams.map((ws) =>
          ws.id === wsId ? updater(ws) : ws
        ),
      });
    },
    [projectBoard, onProjectBoardChange]
  );

  const reloadProject = useCallback(async () => {
    if (isSample) return;
    const refreshed = await api.getProjectBoard(projectId);
    onProjectBoardChange(refreshed);
  }, [projectId, onProjectBoardChange, isSample]);

  // --- Add workstream inline ---
  const handleAddWorkstream = async () => {
    if (!newWsName.trim() || creatingWs) return;
    setCreatingWs(true);
    try {
      if (isSample) {
        const fakeId = -Date.now();
        const updated = {
          ...projectBoard,
          workstreams: [...projectBoard.workstreams, {
            id: fakeId,
            name: newWsName.trim(),
            columns: [
              { id: `sample-col-${fakeId}-1`, title: "To Do", cardIds: [] },
              { id: `sample-col-${fakeId}-2`, title: "In Progress", cardIds: [] },
              { id: `sample-col-${fakeId}-3`, title: "Done", cardIds: [] },
            ],
            cards: {},
          }],
        };
        onProjectBoardChange(updated);
        setCurrentWsId(fakeId);
      } else {
        await api.createWorkstream(projectId, newWsName.trim(), ["To Do", "In Progress", "Done"]);
        const refreshed = await api.getProjectBoard(projectId);
        onProjectBoardChange(refreshed);
        // Select the newly created workstream (last one)
        const last = refreshed.workstreams[refreshed.workstreams.length - 1];
        if (last) setCurrentWsId(last.id);
      }
      setNewWsName("");
      setShowAddWs(false);
    } catch {
      // ignore
    } finally {
      setCreatingWs(false);
    }
  };

  // --- Add column to current workstream ---
  const handleAddColumn = async () => {
    if (!newColumnName.trim() || creatingColumn || !currentWsId) return;
    setCreatingColumn(true);
    try {
      if (isSample) {
        const fakeColId = `sample-col-${Date.now()}`;
        updateWorkstream(currentWsId, (ws) => ({
          ...ws,
          columns: [...ws.columns, { id: fakeColId, title: newColumnName.trim(), cardIds: [] }],
        }));
      } else {
        const col = await api.addColumn(currentWsId, newColumnName.trim());
        updateWorkstream(currentWsId, (ws) => ({
          ...ws,
          columns: [...ws.columns, { id: col.id, title: col.title, cardIds: [] }],
        }));
      }
      setNewColumnName("");
      setAddingColumn(false);
    } catch {
      await reloadProject();
    } finally {
      setCreatingColumn(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
    if (currentWsId) setActiveWsId(currentWsId);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    setActiveWsId(null);

    if (!over || active.id === over.id || !currentWs || !currentWsId) return;

    const newColumns = moveCard(currentWs.columns, active.id as string, over.id as string);
    updateWorkstream(currentWsId, (w) => ({ ...w, columns: newColumns }));

    if (!isSample) {
      const cardId = active.id as string;
      for (const col of newColumns) {
        const idx = col.cardIds.indexOf(cardId);
        if (idx !== -1) {
          try {
            await api.moveCard(cardId, col.id, idx);
          } catch {
            await reloadProject();
          }
          break;
        }
      }
    }
  };

  const handleRenameColumn = async (columnId: string, title: string) => {
    if (!currentWsId) return;
    updateWorkstream(currentWsId, (ws) => ({
      ...ws,
      columns: ws.columns.map((col) =>
        col.id === columnId ? { ...col, title } : col
      ),
    }));
    if (!isSample) {
      try {
        await api.renameColumn(columnId, title);
      } catch {
        await reloadProject();
      }
    }
  };

  const handleAddCard = async (columnId: string, title: string, details: string) => {
    if (!currentWsId) return;
    if (isSample) {
      const fakeId = `sample-card-${Date.now()}`;
      const card: Card = { id: fakeId, title, details, priority: "none" };
      updateWorkstream(currentWsId, (ws) => ({
        ...ws,
        cards: { ...ws.cards, [fakeId]: card },
        columns: ws.columns.map((col) =>
          col.id === columnId ? { ...col, cardIds: [...col.cardIds, fakeId] } : col
        ),
      }));
      return;
    }
    try {
      const card = await api.createCard(columnId, title, details);
      updateWorkstream(currentWsId, (ws) => ({
        ...ws,
        cards: { ...ws.cards, [card.id]: card },
        columns: ws.columns.map((col) =>
          col.id === columnId ? { ...col, cardIds: [...col.cardIds, card.id] } : col
        ),
      }));
    } catch {
      await reloadProject();
    }
  };

  const handleDeleteCard = async (columnId: string, cardId: string) => {
    if (!currentWsId) return;
    updateWorkstream(currentWsId, (ws) => ({
      ...ws,
      cards: Object.fromEntries(Object.entries(ws.cards).filter(([id]) => id !== cardId)),
      columns: ws.columns.map((col) =>
        col.id === columnId ? { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) } : col
      ),
    }));
    if (!isSample) {
      try {
        await api.deleteCard(cardId);
      } catch {
        await reloadProject();
      }
    }
    if (selectedCard?.id === cardId) setSelectedCard(null);
  };

  const handleCardClick = useCallback((cardId: string) => {
    if (!currentWs) return;
    const card = currentWs.cards[cardId];
    if (card) {
      setSelectedCard(card);
      setSelectedWsId(currentWsId);
    }
  }, [currentWs, currentWsId]);

  const handleUpdateCard = async (
    cardId: string,
    fields: {
      title?: string;
      details?: string;
      priority?: string;
      notes?: string;
      due_date?: string;
      subtasks?: api.Subtask[];
      dependencies?: string[];
      deliverable_type?: string;
      key_references?: string;
    }
  ) => {
    if (isSample) {
      const current = selectedWsId != null
        ? projectBoard.workstreams.find((w) => w.id === selectedWsId)?.cards[cardId]
        : null;
      if (current && selectedWsId != null) {
        const updated: Card = {
          ...current,
          ...fields.title != null && { title: fields.title },
          ...fields.details != null && { details: fields.details },
          ...fields.priority != null && { priority: fields.priority as Card["priority"] },
          ...fields.notes != null && { notes: fields.notes },
          ...fields.due_date != null && { dueDate: fields.due_date },
          ...fields.subtasks != null && { subtasks: fields.subtasks },
          ...fields.dependencies != null && { dependencies: fields.dependencies },
          ...fields.deliverable_type != null && { deliverableType: fields.deliverable_type },
          ...fields.key_references != null && { keyReferences: fields.key_references },
        };
        updateWorkstream(selectedWsId, (ws) => ({
          ...ws,
          cards: { ...ws.cards, [cardId]: updated },
        }));
        setSelectedCard(updated);
      }
      return;
    }
    try {
      const updated = await api.updateCard(cardId, fields);
      if (selectedWsId != null) {
        updateWorkstream(selectedWsId, (ws) => ({
          ...ws,
          cards: { ...ws.cards, [cardId]: updated },
        }));
      }
      setSelectedCard(updated);
    } catch {
      // Silently fail
    }
  };

  const handleDeleteFromModal = async (cardId: string) => {
    if (selectedWsId != null) {
      const ws = projectBoard.workstreams.find((w) => w.id === selectedWsId);
      if (ws) {
        const col = ws.columns.find((c) => c.cardIds.includes(cardId));
        if (col) {
          await handleDeleteCard(col.id, cardId);
        }
      }
    }
    setSelectedCard(null);
  };

  const activeCard = useMemo(() => {
    if (!activeCardId || !currentWs) return null;
    return currentWs.cards[activeCardId] ?? null;
  }, [activeCardId, currentWs]);

  const totalCards = projectBoard.workstreams.reduce(
    (sum, ws) => sum + Object.keys(ws.cards).length,
    0
  );

  const currentCardCount = currentWs ? Object.keys(currentWs.cards).length : 0;
  const currentColor = currentWsIndex >= 0 ? WORKSTREAM_COLORS[currentWsIndex % WORKSTREAM_COLORS.length] : WORKSTREAM_COLORS[0];

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col gap-8 px-6 pb-16 pt-12">
        {/* Header with project name, workstream tabs, and add workstream */}
        <header className="rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Project Board
              </p>
              {editingName ? (
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleRenameSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSave();
                    if (e.key === "Escape") { setEditingName(false); setNameInput(projectBoard.project_name); }
                  }}
                  className="mt-3 w-full rounded-xl border bg-white px-3 py-1 font-display text-4xl font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                  style={{ borderColor: "var(--stroke)" }}
                  autoFocus
                />
              ) : (
                <h1
                  className="mt-3 cursor-pointer rounded-xl px-3 py-1 font-display text-4xl font-semibold text-[var(--navy-dark)] transition hover:bg-[var(--surface)]"
                  onClick={() => { if (!isSample) setEditingName(true); }}
                  title={isSample ? undefined : "Click to rename"}
                >
                  {projectBoard.project_name}
                </h1>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Workstreams
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  {projectBoard.workstreams.length}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Total Cards
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--secondary-purple)]">
                  {totalCards}
                </p>
              </div>
            </div>
          </div>

          {/* Workstream tabs */}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-[var(--stroke)] pt-5">
            {projectBoard.workstreams.map((ws, i) => {
              const isActive = ws.id === currentWsId;
              const color = WORKSTREAM_COLORS[i % WORKSTREAM_COLORS.length];
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => setCurrentWsId(ws.id)}
                  className={`rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-[0.1em] transition ${
                    isActive
                      ? "text-white shadow-sm"
                      : "border border-[var(--stroke)] text-[var(--gray-text)] hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                  }`}
                  style={isActive ? { backgroundColor: color } : undefined}
                >
                  {ws.name}
                  <span className="ml-2 text-[10px] opacity-70">
                    {Object.keys(ws.cards).length}
                  </span>
                </button>
              );
            })}

            {/* Add workstream button / inline form */}
            {showAddWs ? (
              <div className="flex items-center gap-2">
                <input
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddWorkstream();
                    if (e.key === "Escape") { setShowAddWs(false); setNewWsName(""); }
                  }}
                  placeholder="Workstream name..."
                  autoFocus
                  className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-xs text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                />
                <button
                  type="button"
                  onClick={handleAddWorkstream}
                  disabled={!newWsName.trim() || creatingWs}
                  className="rounded-full bg-[var(--primary-blue)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                >
                  {creatingWs ? "..." : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddWs(false); setNewWsName(""); }}
                  className="text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddWs(true)}
                className="rounded-full border border-dashed border-[var(--stroke)] px-4 py-2 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
              >
                + Add Workstream
              </button>
            )}
          </div>
        </header>

        {/* Active workstream */}
        {currentWs && (
          <section className="rounded-[24px] border border-[var(--stroke)] bg-white/60 shadow-[var(--shadow)] backdrop-blur">
            {/* Workstream header */}
            <div
              className="flex items-center gap-4 rounded-t-[24px] px-6 py-4"
              style={{ borderLeft: `4px solid ${currentColor}` }}
            >
              <div className="flex-1">
                <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
                  {currentWs.name}
                </h2>
                <p className="mt-1 text-xs text-[var(--gray-text)]">
                  {currentWs.columns.length} column{currentWs.columns.length !== 1 ? "s" : ""} &middot; {currentCardCount} card{currentCardCount !== 1 ? "s" : ""}
                </p>
              </div>
              {/* Add column button */}
              {!addingColumn && (
                <button
                  type="button"
                  onClick={() => { setAddingColumn(true); setNewColumnName(""); }}
                  className="rounded-full border border-dashed border-[var(--stroke)] px-4 py-1.5 text-xs font-semibold text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)] hover:bg-white/80"
                >
                  + Column
                </button>
              )}
            </div>

            {/* Columns */}
            <div className="px-4 pb-5">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div
                  className="grid gap-5"
                  style={{ gridTemplateColumns: `repeat(${currentWs.columns.length + (addingColumn ? 1 : 0)}, minmax(240px, 1fr))` }}
                >
                  {currentWs.columns.map((column) => (
                    <KanbanColumn
                      key={column.id}
                      column={column}
                      cards={column.cardIds.map((cardId) => currentWs.cards[cardId]).filter(Boolean)}
                      onRename={handleRenameColumn}
                      onAddCard={handleAddCard}
                      onDeleteCard={handleDeleteCard}
                      onCardClick={handleCardClick}
                    />
                  ))}

                  {/* Inline add column form */}
                  {addingColumn && (
                    <div className="flex flex-col items-center justify-start rounded-2xl border-2 border-dashed border-[var(--stroke)] bg-[var(--surface)]/50 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                        New Column
                      </p>
                      <input
                        value={newColumnName}
                        onChange={(e) => setNewColumnName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddColumn();
                          if (e.key === "Escape") setAddingColumn(false);
                        }}
                        placeholder="Column name..."
                        autoFocus
                        className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
                      />
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleAddColumn}
                          disabled={!newColumnName.trim() || creatingColumn}
                          className="rounded-full bg-[var(--primary-blue)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                        >
                          {creatingColumn ? "Adding..." : "Add"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingColumn(false)}
                          className="rounded-full border border-[var(--stroke)] px-4 py-1.5 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <DragOverlay>
                  {activeCard ? (
                    <div className="w-[260px]">
                      <KanbanCardPreview card={activeCard} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          </section>
        )}

        {/* Empty state */}
        {!currentWs && projectBoard.workstreams.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] bg-white/60 p-16 text-center">
            <p className="text-sm text-[var(--gray-text)]">No workstreams yet. Add one to get started.</p>
          </div>
        )}
      </main>

      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          onSave={handleUpdateCard}
          onDelete={handleDeleteFromModal}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
};
