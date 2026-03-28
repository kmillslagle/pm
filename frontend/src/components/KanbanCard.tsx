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

const PRIORITY_LABELS: Record<string, string> = {
  high: "H",
  medium: "M",
  low: "L",
};

export const KanbanCard = ({ card, onDelete, onCardClick }: KanbanCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group rounded-xl border border-transparent bg-white px-3.5 py-3 shadow-[0_4px_12px_rgba(3,33,71,0.06)]",
        "transition-all duration-150 hover:shadow-[0_8px_20px_rgba(3,33,71,0.1)] hover:border-[var(--stroke)]",
        isDragging && "opacity-60 shadow-[0_12px_24px_rgba(3,33,71,0.14)]",
      )}
      data-testid={`card-${card.id}`}
    >
      {/* Top row: drag handle + title + priority */}
      <div className="flex items-center gap-2">
        <span
          className="flex-shrink-0 cursor-grab text-[var(--gray-text)] opacity-0 transition group-hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="4" r="1.3" />
            <circle cx="11" cy="4" r="1.3" />
            <circle cx="5" cy="8" r="1.3" />
            <circle cx="11" cy="8" r="1.3" />
            <circle cx="5" cy="12" r="1.3" />
            <circle cx="11" cy="12" r="1.3" />
          </svg>
        </span>

        {card.priority && card.priority !== "none" && (
          <span
            className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
            style={{ backgroundColor: PRIORITY_COLORS[card.priority] }}
          >
            {PRIORITY_LABELS[card.priority]}
          </span>
        )}

        <h4 className="min-w-0 flex-1 truncate font-display text-sm font-semibold leading-tight text-[var(--navy-dark)]">
          {card.title}
        </h4>
      </div>

      {/* Description — compact, 2-line clamp */}
      {card.details && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--gray-text)]">
          {card.details}
        </p>
      )}

      {/* Bottom row: actions */}
      <div className="mt-2 flex items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
        {onCardClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCardClick(card.id);
            }}
            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-[var(--primary-blue)] transition hover:bg-[var(--surface)]"
          >
            Edit
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          className="rounded-lg px-2 py-1 text-[10px] font-semibold text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-red-500"
          aria-label={`Delete ${card.title}`}
        >
          Delete
        </button>
      </div>
    </article>
  );
};
