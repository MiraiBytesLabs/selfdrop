import { useState, useEffect, useRef } from "react";
import Logo from "../components/Logo.jsx";
import { login } from "../api.js";
import { useAuth } from "../store.jsx";

export default function Login({ onDone }) {
  const { saveToken, setUsername } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [persistent, setPersistent] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const cardRef = useRef(null);

  function set(field) {
    return (e) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      setError("");
    };
  }

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!form.username || !form.password) {
      setError("Please enter your username and password.");
      return;
    }

    setLoading(true);
    const { data, error: err } = await login(
      form.username.trim(),
      form.password,
    );
    setLoading(false);

    if (err) {
      setError(err);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }

    saveToken(data.token, persistent);
    setUsername(form.username.trim());
    onDone("dashboard");
  }

  // Enter key support
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Enter") handleSubmit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [form, persistent]);

  return (
    <div className="auth-wrap view-enter">
      <div className={`auth-card ${shake ? "shake" : ""}`} ref={cardRef}>
        <div className="auth-logo">
          <Logo />
        </div>
        <h1 className="auth-title">Admin Login</h1>
        <p className="auth-subtitle">Sign in to manage your file shares.</p>

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
              placeholder="••••••••"
              autoComplete="current-password"
              value={form.password}
              onChange={set("password")}
            />
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={persistent}
              onChange={(e) => setPersistent(e.target.checked)}
            />
            <span>Stay logged in until I explicitly sign out</span>
          </label>

          <button
            className="btn btn-primary btn-full"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
