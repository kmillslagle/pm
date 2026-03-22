import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { LoginForm } from "@/components/LoginForm";

vi.mock("@/lib/api", () => ({
  login: vi.fn().mockResolvedValue({ username: "testuser" }),
  register: vi.fn().mockResolvedValue({ username: "testuser" }),
}));

const renderLogin = () => {
  const onLogin = vi.fn();
  render(<LoginForm onLogin={onLogin} />);
  return { onLogin };
};

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows password mismatch error on register", async () => {
    renderLogin();

    // Switch to register mode
    await userEvent.click(screen.getByText("Create one"));

    await userEvent.type(screen.getByLabelText(/^username$/i), "testuser");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "different");

    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
  });

  it("shows short password error on register", async () => {
    renderLogin();

    // Switch to register mode
    await userEvent.click(screen.getByText("Create one"));

    await userEvent.type(screen.getByLabelText(/^username$/i), "testuser");
    await userEvent.type(screen.getByLabelText(/^password$/i), "short");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "short");

    await userEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(screen.getByText("Password must be at least 8 characters")).toBeInTheDocument();
  });

  it("disables submit button while loading", async () => {
    // Make login take a while
    const api = await import("@/lib/api");
    (api.login as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ username: "testuser" }), 1000))
    );

    renderLogin();

    await userEvent.type(screen.getByLabelText(/^username$/i), "testuser");
    await userEvent.type(screen.getByLabelText(/^password$/i), "password123");

    const submitBtn = screen.getByRole("button", { name: /sign in/i });
    await userEvent.click(submitBtn);

    // Button should be disabled while loading
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    });
  });
});
