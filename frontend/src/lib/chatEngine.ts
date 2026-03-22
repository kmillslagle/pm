import { createId } from "@/lib/kanban";
import type { BoardData, Column } from "@/lib/kanban";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatAction =
  | { type: "create_card"; columnId: string; title: string; details: string }
  | { type: "delete_card"; cardId: string }
  | { type: "move_card"; cardId: string; toColumnId: string }
  | { type: "rename_column"; columnId: string; title: string }
  | { type: "add_column"; title: string }
  | { type: "delete_column"; columnId: string };

export type ChatResult = {
  reply: string;
  actions: ChatAction[];
};

// ---------------------------------------------------------------------------
// Helpers – column / card matching
// ---------------------------------------------------------------------------

function findColumn(
  columns: Column[],
  name: string
): { match: Column | null; ambiguous: Column[] } {
  const lower = name.toLowerCase().trim();

  // Exact (case-insensitive)
  const exact = columns.find((c) => c.title.toLowerCase() === lower);
  if (exact) return { match: exact, ambiguous: [] };

  // Partial includes
  const partial = columns.filter((c) =>
    c.title.toLowerCase().includes(lower)
  );
  if (partial.length === 1) return { match: partial[0], ambiguous: [] };
  if (partial.length > 1) return { match: null, ambiguous: partial };

  // Try the other direction – query includes column name
  const reverse = columns.filter((c) =>
    lower.includes(c.title.toLowerCase())
  );
  if (reverse.length === 1) return { match: reverse[0], ambiguous: [] };
  if (reverse.length > 1) return { match: null, ambiguous: reverse };

  return { match: null, ambiguous: [] };
}

function findCard(
  board: BoardData,
  name: string
): { match: { id: string; title: string } | null; ambiguous: { id: string; title: string }[] } {
  const lower = name.toLowerCase().trim();
  const cards = Object.values(board.cards);

  // Exact (case-insensitive)
  const exact = cards.find((c) => c.title.toLowerCase() === lower);
  if (exact) return { match: exact, ambiguous: [] };

  // Partial includes
  const partial = cards.filter((c) => c.title.toLowerCase().includes(lower));
  if (partial.length === 1) return { match: partial[0], ambiguous: [] };
  if (partial.length > 1) return { match: null, ambiguous: partial };

  // Reverse includes
  const reverse = cards.filter((c) => lower.includes(c.title.toLowerCase()));
  if (reverse.length === 1) return { match: reverse[0], ambiguous: [] };
  if (reverse.length > 1) return { match: null, ambiguous: reverse };

  return { match: null, ambiguous: [] };
}

function columnOfCard(board: BoardData, cardId: string): Column | undefined {
  return board.columns.find((col) => col.cardIds.includes(cardId));
}

// ---------------------------------------------------------------------------
// Intent matchers
// ---------------------------------------------------------------------------

const GREETING_RE = /^\s*(hi|hello|hey|howdy|yo|sup|hiya|greetings)\b/i;
const HELP_RE = /^\s*(help|what can you do|commands|usage)\s*\??$/i;
const STATUS_RE =
  /\b(show board|board status|list cards|status|what'?s on the board|how many cards|board overview|summarize|summary)\b/i;

// Card operations
const CREATE_CARD_RE =
  /(?:add|create|new)\s+(?:a\s+)?card\s+(?:called\s+|named\s+)?["']?(.+?)["']?\s+(?:to|in)\s+(?:the\s+)?["']?(.+?)["']?\s*(?:column)?\s*$/i;

const MOVE_CARD_RE =
  /move\s+(?:card\s+)?["']?(.+?)["']?\s+to\s+(?:the\s+)?["']?(.+?)["']?\s*(?:column)?\s*$/i;

const DELETE_CARD_RE =
  /(?:delete|remove)\s+(?:card\s+)?["']?(.+?)["']?\s*$/i;

// Column operations
const ADD_COLUMN_RE =
  /(?:add|create|new)\s+(?:a\s+)?column\s+(?:called\s+|named\s+)?["']?(.+?)["']?\s*$/i;

const DELETE_COLUMN_RE =
  /(?:delete|remove)\s+column\s+["']?(.+?)["']?\s*$/i;

const RENAME_COLUMN_RE =
  /(?:rename|change)\s+(?:the\s+)?(?:column\s+)?["']?(.+?)["']?\s+(?:column\s+)?to\s+["']?(.+?)["']?\s*$/i;

// ---------------------------------------------------------------------------
// Board summary helper
// ---------------------------------------------------------------------------

function boardSummary(board: BoardData): string {
  const totalCards = Object.keys(board.cards).length;
  const lines = board.columns.map((col) => {
    const count = col.cardIds.length;
    const cardList =
      count > 0
        ? col.cardIds
            .map((id) => board.cards[id]?.title ?? id)
            .map((t) => `  - ${t}`)
            .join("\n")
        : "  (empty)";
    return `**${col.title}** (${count}):\n${cardList}`;
  });

  return `Here's your board at a glance — ${totalCards} card${totalCards === 1 ? "" : "s"} across ${board.columns.length} column${board.columns.length === 1 ? "" : "s"}:\n\n${lines.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function processChat(message: string, board: BoardData): ChatResult {
  const trimmed = message.trim();

  // ── Greeting ───────────────────────────────────────────────────────────
  if (GREETING_RE.test(trimmed)) {
    return {
      reply:
        "Hey there! I'm your board assistant. I can create, move, or delete cards, manage columns, and give you a quick board summary. Just ask!",
      actions: [],
    };
  }

  // ── Help ───────────────────────────────────────────────────────────────
  if (HELP_RE.test(trimmed)) {
    return {
      reply: [
        "Here's what I can help with:",
        "",
        "- **Add a card** — \"add card Fix login bug to In Progress\"",
        "- **Move a card** — \"move Fix login bug to Done\"",
        "- **Delete a card** — \"delete card Fix login bug\"",
        "- **Add a column** — \"add column QA\"",
        "- **Rename a column** — \"rename column QA to Testing\"",
        "- **Delete a column** — \"delete column QA\"",
        "- **Board summary** — \"show board\" or \"status\"",
        "",
        "I match card and column names loosely, so you don't have to be exact.",
      ].join("\n"),
      actions: [],
    };
  }

  // ── Board status / summary ─────────────────────────────────────────────
  if (STATUS_RE.test(trimmed)) {
    return { reply: boardSummary(board), actions: [] };
  }

  // ── Create card ────────────────────────────────────────────────────────
  const createMatch = trimmed.match(CREATE_CARD_RE);
  if (createMatch) {
    const [, cardTitle, colName] = createMatch;
    const { match: col, ambiguous } = findColumn(board.columns, colName);

    if (!col && ambiguous.length > 0) {
      return {
        reply: `I found multiple columns matching "${colName}": ${ambiguous.map((c) => `"${c.title}"`).join(", ")}. Could you be more specific?`,
        actions: [],
      };
    }
    if (!col) {
      return {
        reply: `I couldn't find a column matching "${colName}". Your columns are: ${board.columns.map((c) => c.title).join(", ")}.`,
        actions: [],
      };
    }

    const details = `Created via chat assistant.`;
    return {
      reply: `Got it! I've added "${cardTitle}" to **${col.title}**.`,
      actions: [
        { type: "create_card", columnId: col.id, title: cardTitle, details },
      ],
    };
  }

  // ── Move card ──────────────────────────────────────────────────────────
  const moveMatch = trimmed.match(MOVE_CARD_RE);
  if (moveMatch) {
    const [, cardName, colName] = moveMatch;

    // Resolve card
    const { match: card, ambiguous: cardAmb } = findCard(board, cardName);
    if (!card && cardAmb.length > 0) {
      return {
        reply: `Multiple cards match "${cardName}": ${cardAmb.map((c) => `"${c.title}"`).join(", ")}. Which one did you mean?`,
        actions: [],
      };
    }
    if (!card) {
      return {
        reply: `I couldn't find a card matching "${cardName}". Try "show board" to see all cards.`,
        actions: [],
      };
    }

    // Resolve column
    const { match: col, ambiguous: colAmb } = findColumn(board.columns, colName);
    if (!col && colAmb.length > 0) {
      return {
        reply: `Multiple columns match "${colName}": ${colAmb.map((c) => `"${c.title}"`).join(", ")}. Which one did you mean?`,
        actions: [],
      };
    }
    if (!col) {
      return {
        reply: `I couldn't find a column matching "${colName}". Your columns are: ${board.columns.map((c) => c.title).join(", ")}.`,
        actions: [],
      };
    }

    const currentCol = columnOfCard(board, card.id);
    if (currentCol?.id === col.id) {
      return {
        reply: `"${card.title}" is already in **${col.title}**.`,
        actions: [],
      };
    }

    return {
      reply: `Done! I moved "${card.title}" to **${col.title}**.`,
      actions: [{ type: "move_card", cardId: card.id, toColumnId: col.id }],
    };
  }

  // ── Delete card ────────────────────────────────────────────────────────
  // Check delete card BEFORE delete column so "delete column X" is handled
  // by the column regex first.
  const deleteColMatch = trimmed.match(DELETE_COLUMN_RE);
  if (deleteColMatch) {
    const [, colName] = deleteColMatch;
    const { match: col, ambiguous } = findColumn(board.columns, colName);

    if (!col && ambiguous.length > 0) {
      return {
        reply: `Multiple columns match "${colName}": ${ambiguous.map((c) => `"${c.title}"`).join(", ")}. Which one?`,
        actions: [],
      };
    }
    if (!col) {
      return {
        reply: `I couldn't find a column matching "${colName}". Your columns are: ${board.columns.map((c) => c.title).join(", ")}.`,
        actions: [],
      };
    }

    const cardCount = col.cardIds.length;
    const warning =
      cardCount > 0
        ? ` It had ${cardCount} card${cardCount === 1 ? "" : "s"} in it.`
        : "";

    return {
      reply: `Removed the **${col.title}** column.${warning}`,
      actions: [{ type: "delete_column", columnId: col.id }],
    };
  }

  const deleteCardMatch = trimmed.match(DELETE_CARD_RE);
  if (deleteCardMatch) {
    const [, cardName] = deleteCardMatch;
    const { match: card, ambiguous } = findCard(board, cardName);

    if (!card && ambiguous.length > 0) {
      return {
        reply: `Multiple cards match "${cardName}": ${ambiguous.map((c) => `"${c.title}"`).join(", ")}. Which one should I delete?`,
        actions: [],
      };
    }
    if (!card) {
      return {
        reply: `I couldn't find a card matching "${cardName}". Try "show board" to see all cards.`,
        actions: [],
      };
    }

    return {
      reply: `Deleted "${card.title}".`,
      actions: [{ type: "delete_card", cardId: card.id }],
    };
  }

  // ── Add column ─────────────────────────────────────────────────────────
  const addColMatch = trimmed.match(ADD_COLUMN_RE);
  if (addColMatch) {
    const [, colTitle] = addColMatch;

    // Check if a column with that name already exists
    const existing = board.columns.find(
      (c) => c.title.toLowerCase() === colTitle.toLowerCase()
    );
    if (existing) {
      return {
        reply: `A column named **${existing.title}** already exists.`,
        actions: [],
      };
    }

    return {
      reply: `Added a new column: **${colTitle}**.`,
      actions: [{ type: "add_column", title: colTitle }],
    };
  }

  // ── Rename column ──────────────────────────────────────────────────────
  const renameMatch = trimmed.match(RENAME_COLUMN_RE);
  if (renameMatch) {
    const [, oldName, newName] = renameMatch;
    const { match: col, ambiguous } = findColumn(board.columns, oldName);

    if (!col && ambiguous.length > 0) {
      return {
        reply: `Multiple columns match "${oldName}": ${ambiguous.map((c) => `"${c.title}"`).join(", ")}. Which one should I rename?`,
        actions: [],
      };
    }
    if (!col) {
      return {
        reply: `I couldn't find a column matching "${oldName}". Your columns are: ${board.columns.map((c) => c.title).join(", ")}.`,
        actions: [],
      };
    }

    return {
      reply: `Renamed **${col.title}** to **${newName}**.`,
      actions: [{ type: "rename_column", columnId: col.id, title: newName }],
    };
  }

  // ── Fallback ───────────────────────────────────────────────────────────
  return {
    reply:
      "I'm not sure what you mean. Here are some things you can try:\n\n" +
      '- "add card Fix login bug to In Progress"\n' +
      '- "move Fix login bug to Done"\n' +
      '- "delete card Fix login bug"\n' +
      '- "add column QA"\n' +
      '- "rename column QA to Testing"\n' +
      '- "delete column QA"\n' +
      '- "show board"\n' +
      '- "help"',
    actions: [],
  };
}
