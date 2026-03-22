import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { CardDetailModal } from "@/components/CardDetailModal";
import type { Card, Column } from "@/lib/kanban";

const mockCard: Card = {
  id: "card-1",
  title: "Test Card",
  details: "Card details here",
  priority: "medium",
  notes: "Some notes",
  dueDate: "2026-04-01",
  subtasks: [
    { id: "st-1", title: "Subtask one", done: false },
    { id: "st-2", title: "Subtask two", done: true },
  ],
};

const mockColumns: Column[] = [
  { id: "col-1", title: "To Do", cardIds: ["card-1"] },
  { id: "col-2", title: "Done", cardIds: [] },
];

const renderModal = (cardOverride?: Partial<Card>) => {
  const card = { ...mockCard, ...cardOverride };
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  render(
    <CardDetailModal
      card={card}
      columns={mockColumns}
      onSave={onSave}
      onDelete={onDelete}
      onClose={onClose}
    />
  );
  return { onSave, onDelete, onClose };
};

describe("CardDetailModal", () => {
  it("renders all fields", () => {
    renderModal();
    expect(screen.getByTestId("card-title-input")).toHaveValue("Test Card");
    expect(screen.getByTestId("card-notes-input")).toHaveValue("Some notes");
    expect(screen.getByTestId("card-due-date-input")).toHaveValue("2026-04-01");
    expect(screen.getByText("Subtask one")).toBeInTheDocument();
    expect(screen.getByText("Subtask two")).toBeInTheDocument();
    expect(screen.getByTestId("delete-card-btn")).toBeInTheDocument();
  });

  it("calls onSave on title blur", async () => {
    const { onSave } = renderModal();
    const input = screen.getByTestId("card-title-input");
    await userEvent.clear(input);
    await userEvent.type(input, "Updated Title");
    await userEvent.tab(); // triggers blur
    expect(onSave).toHaveBeenCalledWith("card-1", { title: "Updated Title" });
  });

  it("calls onDelete on delete confirmation", async () => {
    const { onDelete } = renderModal();
    const deleteBtn = screen.getByTestId("delete-card-btn");

    // First click shows confirmation
    await userEvent.click(deleteBtn);
    expect(screen.getByText("Confirm Delete")).toBeInTheDocument();

    // Second click actually deletes
    await userEvent.click(screen.getByText("Confirm Delete"));
    expect(onDelete).toHaveBeenCalledWith("card-1");
  });

  it("handles priority selection", async () => {
    const { onSave } = renderModal();
    await userEvent.click(screen.getByTestId("priority-high"));
    expect(onSave).toHaveBeenCalledWith("card-1", { priority: "high" });
  });

  it("adds a subtask via input and Enter", async () => {
    const { onSave } = renderModal();
    const input = screen.getByTestId("subtask-input");
    await userEvent.type(input, "New subtask{Enter}");
    expect(onSave).toHaveBeenCalledWith(
      "card-1",
      expect.objectContaining({
        subtasks: expect.arrayContaining([
          expect.objectContaining({ title: "New subtask", done: false }),
        ]),
      })
    );
  });

  it("toggles a subtask checkbox", async () => {
    const { onSave } = renderModal();
    const checkbox = screen.getByTestId("subtask-check-st-1");
    await userEvent.click(checkbox);
    expect(onSave).toHaveBeenCalledWith(
      "card-1",
      expect.objectContaining({
        subtasks: expect.arrayContaining([
          expect.objectContaining({ id: "st-1", done: true }),
        ]),
      })
    );
  });

  it("deletes a subtask", async () => {
    const { onSave } = renderModal();
    const deleteBtn = screen.getByTestId("subtask-delete-st-1");
    await userEvent.click(deleteBtn);
    expect(onSave).toHaveBeenCalledWith(
      "card-1",
      expect.objectContaining({
        subtasks: [expect.objectContaining({ id: "st-2" })],
      })
    );
  });
});
