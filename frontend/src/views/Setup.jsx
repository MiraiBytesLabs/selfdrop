import { useState } from "react";
import Logo from "../components/Logo.jsx";
import { setup } from "../api.js";
import { useAuth } from "../store.jsx";

export default function Setup({ onDone }) {
  const { saveToken, setUsername } = useAuth();
  const [form, setForm] = useState({ username: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [confirmErr, setConfirmErr] = useState(false);
  const [loading, setLoading] = useState(false);

  function set(field) {
    return (e) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      setError("");
      setConfirmErr(false);
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setConfirmErr(false);

    if (form.username.trim().length < 2) {
      setError("Username must be at least 2 characters.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      setConfirmErr(true);
      return;
    }

    setLoading(true);
    const { data, error: err } = await setup(
      form.username.trim(),
      form.password,
    );
    setLoading(false);

    if (err) {
      setError(err);
      return;
    }

    saveToken(data.token, true);
    setUsername(form.username.trim());
    onDone("dashboard");
  }

  return (
    <div className="auth-wrap view-enter">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo />
        </div>
        <h1 className="auth-title">Welcome to SelfDrop</h1>
        <p className="auth-subtitle">
          Create an admin account to get started. These credentials will be
          stored securely in your local database.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              className="form-input"
              type="text"
              placeholder="admin"
              autoComplete="username"
              autoFocus
              value={form.username}
              onChange={set("username")}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="Choose a strong password"
              autoComplete="new-password"
              value={form.password}
              onChange={set("password")}
            />
            <div className="form-hint">Minimum 8 characters.</div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input
              className={`form-input ${confirmErr ? "error" : ""}`}
              type="password"
              placeholder="Repeat password"
              autoComplete="new-password"
              value={form.confirm}
              onChange={set("confirm")}
            />
            {confirmErr && (
              <div className="form-error">Passwords do not match.</div>
            )}
          </div>

          <div className="divider" />

          <button
            className="btn btn-primary btn-full"
            type="submit"
            disabled={loading}
          >
            {loading ? "Creating…" : "Create Admin Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
