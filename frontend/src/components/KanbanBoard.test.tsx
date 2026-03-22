import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  createCard: vi.fn().mockResolvedValue({
    id: "card-new",
    title: "New card",
    details: "Notes",
  }),
  deleteCard: vi.fn().mockResolvedValue(undefined),
  moveCard: vi.fn().mockResolvedValue(undefined),
  renameColumn: vi.fn().mockResolvedValue(undefined),
  updateCard: vi.fn().mockResolvedValue({
    id: "card-1",
    title: "Updated",
    details: "Updated details",
  }),
  getBoard: vi.fn().mockResolvedValue({ columns: [], cards: {} }),
}));

// Must import after mock
import * as api from "@/lib/api";

const mockBoard: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    { id: "col-progress", title: "In Progress", cardIds: ["card-4", "card-5"] },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": { id: "card-1", title: "Align roadmap themes", details: "Draft quarterly themes." },
    "card-2": { id: "card-2", title: "Gather customer signals", details: "Review support tags." },
    "card-3": { id: "card-3", title: "Prototype analytics view", details: "Sketch dashboard." },
    "card-4": { id: "card-4", title: "Refine status language", details: "Standardize labels." },
    "card-5": { id: "card-5", title: "Design card layout", details: "Add hierarchy." },
    "card-6": { id: "card-6", title: "QA micro-interactions", details: "Verify states." },
    "card-7": { id: "card-7", title: "Ship marketing page", details: "Final copy approved." },
    "card-8": { id: "card-8", title: "Close onboarding sprint", details: "Document release." },
  },
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

const renderBoard = (boardOverride?: Partial<BoardData>) => {
  const board = { ...mockBoard, ...boardOverride };
  const onBoardChange = vi.fn();
  render(
    <KanbanBoard
      boardId={1}
      projectName="Test Project"
      board={board}
      onBoardChange={onBoardChange}
    />
  );
  return { onBoardChange };
};

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders five columns", () => {
    renderBoard();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("displays the project name", () => {
    renderBoard();
    expect(screen.getByText("Test Project")).toBeInTheDocument();
  });

  it("calls api.renameColumn when a column is renamed", async () => {
    renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.type(input, "X");
    expect(api.renameColumn).toHaveBeenCalledWith("col-backlog", "BacklogX");
  });

  it("calls api.createCard when adding a card", async () => {
    renderBoard();
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    await waitFor(() => {
      expect(api.createCard).toHaveBeenCalledWith("col-backlog", "New card", "Notes");
    });
  });

  it("calls api.deleteCard when deleting a card", async () => {
    renderBoard();
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    await userEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(api.deleteCard).toHaveBeenCalledWith("card-1");
    });
  });
});
