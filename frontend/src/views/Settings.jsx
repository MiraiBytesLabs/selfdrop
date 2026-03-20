import { useState, useEffect } from "react";
import Topbar from "../components/Topbar.jsx";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../store.jsx";
import {
  getSettings,
  saveSettings,
  getStorageInfo,
  revokeAllShares,
  clearExpired,
  logout,
  changePassword,
} from "../api.js";

const EXPIRY_OPTIONS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
];

export default function Settings({ onNavigate }) {
  const showToast = useToast();
  const { clearToken, username } = useAuth();

  // ── Data ─────────────────────────────────────────────────
  const [settings, setSettings] = useState(null);
  const [storage, setStorage] = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Admin account ─────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");

  // Password visibility toggles
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // ── Share defaults ────────────────────────────────────────
  const [defaultExpiry, setDefaultExpiry] = useState("24");
  const [defaultLimit, setDefaultLimit] = useState("0");
  const [defaultMask, setDefaultMask] = useState(false);
  const [defaultsLoading, setDefaultsLoading] = useState(false);

  // ── Public URL ────────────────────────────────────────────
  const [publicUrl, setPublicUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  // ── Danger zone ───────────────────────────────────────────
  const [dangerDialog, setDangerDialog] = useState(null);
  const [dangerInput, setDangerInput] = useState("");
  const [dangerLoading, setDangerLoading] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: s }, { data: st }] = await Promise.all([
      getSettings(),
      getStorageInfo(),
    ]);
    if (s) {
      setSettings(s);
      setDefaultExpiry(s.default_expiry_hours || "24");
      setDefaultLimit(s.default_download_limit || "0");
      setDefaultMask(s.default_mask_filenames === "1");
      setPublicUrl(s.public_url || "");
    }
    if (st) setStorage(st);
    setLoading(false);
  }

  // ── Change password ───────────────────────────────────────
  async function handleChangePassword(e) {
    e.preventDefault();
    setPwError("");
    if (!currentPw) {
      setPwError("Current password is required.");
      return;
    }
    if (newPw.length < 8) {
      setPwError("New password must be at least 8 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("Passwords do not match.");
      return;
    }

    setPwLoading(true);
    const { error } = await changePassword(currentPw, newPw);
    setPwLoading(false);

    if (error) {
      setPwError(error);
      return;
    }

    showToast("Password updated successfully.", "success");
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setShowCurrentPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
  }

  // ── Save share defaults ───────────────────────────────────
  async function handleSaveDefaults() {
    setDefaultsLoading(true);
    const { error } = await saveSettings({
      default_expiry_hours: parseInt(defaultExpiry),
      default_download_limit: parseInt(defaultLimit),
      default_mask_filenames: defaultMask,
    });
    setDefaultsLoading(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast("Share defaults saved.", "success");
  }

  // ── Save public URL ───────────────────────────────────────
  async function handleSavePublicUrl() {
    setUrlLoading(true);
    const { error } = await saveSettings({ public_url: publicUrl });
    setUrlLoading(false);
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast("Public URL saved.", "success");
  }

  // ── Danger zone ───────────────────────────────────────────
  function openDanger(action) {
    setDangerDialog(action);
    setDangerInput("");
  }

  async function confirmDanger() {
    if (dangerInput !== "confirm") return;
    setDangerLoading(true);
    const fn = dangerDialog === "revoke-all" ? revokeAllShares : clearExpired;
    const { data, error } = await fn();
    setDangerLoading(false);
    setDangerDialog(null);
    setDangerInput("");
    if (error) {
      showToast(error, "error");
      return;
    }
    showToast(data.message, "success");
  }

  if (loading)
    return (
      <div className="admin-wrap">
        <Topbar active="settings" onNavigate={onNavigate} />
        <div className="loading-wrap">loading…</div>
      </div>
    );

  return (
    <div className="admin-wrap view-enter">
      <Topbar active="settings" onNavigate={onNavigate} />
      <div className="admin-content admin-content--narrow">
        <div className="page-header">
          <div>
            <div className="page-title">Settings</div>
            <div className="page-subtitle">Manage your SelfDrop instance</div>
          </div>
        </div>

        {/* ── Admin Account ──────────────────────────────── */}
        <Section title="Admin Account" subtitle="Update your login credentials">
          <form onSubmit={handleChangePassword}>
            {pwError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {pwError}
              </div>
            )}
            <div className="settings-grid">
              <Field label="Current Password">
                <PasswordInput
                  value={currentPw}
                  show={showCurrentPw}
                  onToggle={() => setShowCurrentPw((v) => !v)}
                  onChange={(e) => {
                    setCurrentPw(e.target.value);
                    setPwError("");
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </Field>
              <Field label="New Password">
                <PasswordInput
                  value={newPw}
                  show={showNewPw}
                  onToggle={() => setShowNewPw((v) => !v)}
                  onChange={(e) => {
                    setNewPw(e.target.value);
                    setPwError("");
                  }}
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm New Password">
                <PasswordInput
                  value={confirmPw}
                  show={showConfirmPw}
                  onToggle={() => setShowConfirmPw((v) => !v)}
                  onChange={(e) => {
                    setConfirmPw(e.target.value);
                    setPwError("");
                  }}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                className="btn btn-secondary"
                type="submit"
                disabled={pwLoading}
              >
                {pwLoading ? "Updating…" : "Update Password"}
              </button>
            </div>
          </form>
        </Section>

        {/* ── Share Defaults ─────────────────────────────── */}
        <Section
          title="Share Defaults"
          subtitle="Pre-fill the create share form with these values"
        >
          <div className="settings-grid">
            <Field label="Default expiry">
              <select
                className="form-input"
                value={defaultExpiry}
                onChange={(e) => setDefaultExpiry(e.target.value)}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.hours} value={String(o.hours)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default download limit" hint="0 = unlimited">
              <input
                className="form-input"
                type="number"
                min="0"
                placeholder="0 (unlimited)"
                value={defaultLimit}
                onChange={(e) => setDefaultLimit(e.target.value)}
              />
            </Field>
          </div>
          <label className="checkbox-row" style={{ marginTop: 12 }}>
            <input
              type="checkbox"
              checked={defaultMask}
              onChange={(e) => setDefaultMask(e.target.checked)}
            />
            <span>Mask filenames by default</span>
          </label>
          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-secondary"
              onClick={handleSaveDefaults}
              disabled={defaultsLoading}
            >
              {defaultsLoading ? "Saving…" : "Save Defaults"}
            </button>
          </div>
        </Section>

        {/* ── Public URL ─────────────────────────────────── */}
        <Section
          title="Public URL"
          subtitle="The base URL used when generating share links. Set this if your admin panel is on a local IP but shares are accessed via a public domain."
        >
          <Field
            label="Public base URL"
            hint="e.g. https://files.yourdomain.com — leave blank to use the current browser URL"
          >
            <input
              className="form-input"
              type="url"
              placeholder="https://files.yourdomain.com"
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
            />
          </Field>
          {publicUrl && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "var(--text-2)",
                fontFamily: "var(--mono)",
              }}
            >
              Share links will use:{" "}
              <strong>{publicUrl}/share/&lt;uuid&gt;</strong>
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-secondary"
              onClick={handleSavePublicUrl}
              disabled={urlLoading}
            >
              {urlLoading ? "Saving…" : "Save URL"}
            </button>
          </div>
        </Section>

        {/* ── Storage Info ───────────────────────────────── */}
        <Section
          title="Storage Info"
          subtitle="Read-only information about your SelfDrop instance"
        >
          {storage && (
            <div className="info-table">
              <InfoRow label="Files root" value={storage.filesRoot.path} mono />
              <InfoRow
                label="Files accessible"
                value={storage.filesRoot.exists ? "Yes" : "No — check mount"}
                warn={!storage.filesRoot.exists}
              />
              <InfoRow label="Database" value={storage.database.path} mono />
              <InfoRow
                label="Database size"
                value={storage.database.sizeHuman}
              />
              <InfoRow
                label="ZIP temp dir"
                value={storage.zipTempDir.path}
                mono
              />
              <InfoRow
                label="Node.js"
                value={storage.system.nodeVersion}
                mono
              />
              <InfoRow
                label="Memory usage"
                value={`${storage.system.memoryMB} MB / ${storage.system.totalMemoryMB} MB`}
              />
              <InfoRow
                label="Uptime"
                value={formatUptime(storage.system.uptime)}
              />
            </div>
          )}
        </Section>

        {/* ── Danger Zone ────────────────────────────────── */}
        <Section title="Danger Zone" danger>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <DangerRow
              title="Revoke all active shares"
              description="Immediately invalidates all share links that haven't expired yet. Recipients will get a 404."
              buttonLabel="Revoke all"
              onClick={() => openDanger("revoke-all")}
            />
            <DangerRow
              title="Clear expired shares"
              description="Removes expired and limit-reached share records from the database. Frees up space, cannot be undone."
              buttonLabel="Clear expired"
              onClick={() => openDanger("clear-expired")}
            />
          </div>
        </Section>
      </div>

      {/* Danger dialog */}
      {dangerDialog && (
        <div className="overlay" onClick={() => setDangerDialog(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">
              {dangerDialog === "revoke-all"
                ? "Revoke all active shares?"
                : "Clear expired shares?"}
            </div>
            <div className="dialog-body">
              {dangerDialog === "revoke-all"
                ? "All active share links will stop working immediately. This cannot be undone."
                : "All expired and limit-reached share records will be permanently deleted from the database."}
              <div style={{ marginTop: 16 }}>
                <label
                  style={{
                    fontSize: 12,
                    color: "var(--text-2)",
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Type <strong>confirm</strong> to proceed
                </label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="confirm"
                  value={dangerInput}
                  onChange={(e) => setDangerInput(e.target.value)}
                  autoFocus
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    dangerInput === "confirm" &&
                    confirmDanger()
                  }
                />
              </div>
            </div>
            <div className="dialog-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setDangerDialog(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger-ghost"
                onClick={confirmDanger}
                disabled={dangerInput !== "confirm" || dangerLoading}
              >
                {dangerLoading
                  ? "Working…"
                  : dangerDialog === "revoke-all"
                    ? "Revoke all"
                    : "Clear expired"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

/**
 * Collapsible section card.
 * Starts expanded by default, except danger zone which starts collapsed.
 */
function Section({ title, subtitle, children, danger }) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div
      className={`settings-section-card ${danger ? "settings-section-card--danger" : ""}`}
    >
      <div
        className="settings-section-card__header"
        onClick={() => setCollapsed((c) => !c)}
        style={{ cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ flex: 1 }}>
          <div className="settings-section-card__title">
            {title}{" "}
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              style={{
                color: danger ? "var(--danger)" : "var(--text-3)",
                flexShrink: 0,
                transition: "transform 0.2s",
                transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              }}
            >
              <path
                d="M3 6l5 5 5-5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {subtitle && !collapsed && (
            <div className="settings-section-card__subtitle">{subtitle}</div>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="settings-section-card__body">{children}</div>
      )}
    </div>
  );
}

/**
 * Password input with show/hide toggle.
 */
function PasswordInput({
  value,
  show,
  onToggle,
  onChange,
  placeholder,
  autoComplete,
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        className="form-input"
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        style={{ paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-3)",
          padding: 2,
          display: "flex",
          alignItems: "center",
        }}
        title={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M2 2l12 12M6.5 6.6A2 2 0 0010 10"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M4.2 4.3C2.5 5.4 1 8 1 8s3 5 7 5c1.4 0 2.7-.5 3.8-1.2M7 3.1C7.3 3 7.7 3 8 3c4 0 7 5 7 5s-.8 1.4-2 2.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  );
}

function InfoRow({ label, value, mono, warn }) {
  return (
    <div className="info-row">
      <span className="info-row__label">{label}</span>
      <span
        className={`info-row__value ${mono ? "info-row__value--mono" : ""} ${warn ? "info-row__value--warn" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function DangerRow({ title, description, buttonLabel, onClick }) {
  return (
    <div className="danger-row">
      <div className="danger-row__text">
        <div className="danger-row__title">{title}</div>
        <div className="danger-row__desc">{description}</div>
      </div>
      <button
        className="btn btn-danger-ghost"
        style={{ flexShrink: 0 }}
        onClick={onClick}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
