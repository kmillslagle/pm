"use client";

import { useState, type FormEvent } from "react";

type LoginFormProps = {
  onLogin: (username: string) => void;
};

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  // Field-level errors
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [generalError, setGeneralError] = useState("");

  const clearErrors = () => {
    setUsernameError("");
    setPasswordError("");
    setConfirmError("");
    setGeneralError("");
  };

  const validate = (): boolean => {
    clearErrors();
    let valid = true;

    if (!username.trim()) {
      setUsernameError("Username is required");
      valid = false;
    }

    if (!password) {
      setPasswordError("Password is required");
      valid = false;
    } else if (isRegister && password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      valid = false;
    }

    if (isRegister && password !== confirmPassword) {
      setConfirmError("Passwords do not match");
      valid = false;
    }

    return valid;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    clearErrors();
    try {
      const api = await import("@/lib/api");
      const user = isRegister
        ? await api.register(username, password, email || undefined)
        : await api.login(username, password);
      onLogin(user.username);
    } catch (err) {
      if (isRegister) {
        const msg =
          err instanceof Error && err.message.includes("409")
            ? "Username already taken"
            : "Could not create account";
        setGeneralError(msg);
      } else {
        setGeneralError("Invalid username or password");
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegister((prev) => !prev);
    setConfirmPassword("");
    setEmail("");
    clearErrors();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          {isRegister ? "Get started" : "Welcome back"}
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
          Kanban Studio
        </h1>
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (usernameError) setUsernameError("");
              }}
              className={`mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] ${
                usernameError
                  ? "border-red-400"
                  : "border-[var(--stroke)]"
              }`}
              required
            />
            {usernameError && (
              <p className="mt-1 text-xs font-medium text-red-500">
                {usernameError}
              </p>
            )}
          </div>

          {isRegister && (
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
              >
                Email{" "}
                <span className="normal-case tracking-normal font-normal">
                  (optional)
                </span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError("");
              }}
              className={`mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] ${
                passwordError
                  ? "border-red-400"
                  : "border-[var(--stroke)]"
              }`}
              required
            />
            {passwordError && (
              <p className="mt-1 text-xs font-medium text-red-500">
                {passwordError}
              </p>
            )}
            {isRegister && !passwordError && (
              <p className="mt-1 text-xs text-[var(--gray-text)]">
                At least 8 characters
              </p>
            )}
          </div>

          {isRegister && (
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (confirmError) setConfirmError("");
                }}
                className={`mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] ${
                  confirmError
                    ? "border-red-400"
                    : "border-[var(--stroke)]"
                }`}
                required
              />
              {confirmError && (
                <p className="mt-1 text-xs font-medium text-red-500">
                  {confirmError}
                </p>
              )}
            </div>
          )}

          {generalError && (
            <p className="text-sm font-medium text-red-500">{generalError}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[var(--secondary-purple)] px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {loading
              ? isRegister
                ? "Creating account..."
                : "Signing in..."
              : isRegister
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
          {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={toggleMode}
            className="font-semibold text-[var(--primary-blue)] hover:underline"
          >
            {isRegister ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>
    </div>
  );
};
