import { useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Card } from "@/lib/kanban";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onCardClick?: (cardId: string) => void;
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#ecad0a",
  low: "#209dd7",
};

export const KanbanCard = ({ card, onDelete, onCardClick }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!mouseDownPos.current) return;
    const dx = Math.abs(e.clientX - mouseDownPos.current.x);
    const dy = Math.abs(e.clientY - mouseDownPos.current.y);
    // Only trigger click if mouse didn't move significantly (not a drag)
    if (dx < 5 && dy < 5 && onCardClick) {
      onCardClick(card.id);
    }
    mouseDownPos.current = null;
  };

  const doneCount = card.subtasks?.filter((s) => s.done).length ?? 0;
  const totalCount = card.subtasks?.length ?? 0;

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      data-testid={`card-${card.id}`}
    >
      <div className="flex items-start gap-2">
        {/* Drag handle */}
        <span
          className="mt-1 flex-shrink-0 cursor-grab text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
          {...attributes}
          {...listeners}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <circle cx="5" cy="4" r="1.3" />
            <circle cx="11" cy="4" r="1.3" />
            <circle cx="5" cy="8" r="1.3" />
            <circle cx="11" cy="8" r="1.3" />
            <circle cx="5" cy="12" r="1.3" />
            <circle cx="11" cy="12" r="1.3" />
          </svg>
        </span>

        {/* Card body — clickable */}
        <div
          className="flex-1 cursor-pointer"
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
        >
          <div className="flex items-center gap-2">
            {card.priority && card.priority !== "none" && (
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: PRIORITY_COLORS[card.priority] }}
                title={`${card.priority} priority`}
              />
            )}
            <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h4>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
            {card.details}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {card.dueDate && (
              <span className="text-xs text-[var(--gray-text)]">
                Due: {card.dueDate}
              </span>
            )}
            {totalCount > 0 && (
              <span className="text-xs font-semibold text-[var(--gray-text)]">
                {doneCount}/{totalCount}
              </span>
            )}
          </div>
        </div>

        {/* Delete */}
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          className="flex-shrink-0 rounded-full border border-transparent px-2 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:text-[var(--navy-dark)]"
          aria-label={`Delete ${card.title}`}
        >
          Remove
        </button>
      </div>
    </article>
  );
};
