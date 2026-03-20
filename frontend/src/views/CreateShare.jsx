import { useState, useEffect } from "react";
import Topbar from "../components/Topbar.jsx";
import FileBrowser from "../components/FileBrowser.jsx";
import { createShare, getSettings } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { getMimeTypeFromFilename } from "../utils/fileUtils.js";
import FileTypeIcon from "../components/FileTypeIcon.jsx";
import { useShareUrl, buildShareUrl } from "../utils/useShareUrl.js";

const EXPIRY_PRESETS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
];

export default function CreateShare({ onNavigate }) {
  const showToast = useToast();
  const { shareBase } = useShareUrl();

  // Load share defaults from server on mount
  useEffect(() => {
    getSettings().then(({ data }) => {
      if (!data) return;
      // Find matching expiry preset index
      const hours = parseInt(data.default_expiry_hours || "24");
      const presetIdx = EXPIRY_PRESETS.findIndex((p) => p.hours === hours);
      if (presetIdx >= 0) setExpiryPreset(presetIdx);
      if (data.default_download_limit && data.default_download_limit !== "0") {
        setDownloadLimit(data.default_download_limit);
      }
      if (data.default_mask_filenames === "1") setMaskFilenames(true);
    });
  }, []);

  // Share name
  const [shareName, setShareName] = useState("");

  // Selected files: array of { path, entry } objects
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  // Share settings
  const [expiryPreset, setExpiryPreset] = useState(2); // 1 day
  const [customExpiry, setCustomExpiry] = useState("");
  const [downloadLimit, setDownloadLimit] = useState("");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [maskFilenames, setMaskFilenames] = useState(false);

  // Form state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);

  // Auto-expand panel when a new file is added
  useEffect(() => {
    if (selectedFiles.length > 0) setPanelCollapsed(false);
  }, [selectedFiles.length]);

  function handleSelect(path, entry) {
    setError("");
    if (!path) return; // deselect handled in browser
    setSelectedFiles((prev) => {
      const exists = prev.find((f) => f.path === path);
      if (exists) return prev.filter((f) => f.path !== path);
      return [
        ...prev,
        {
          path,
          entry: entry || { name: path.split("/").pop(), sizeHuman: "" },
        },
      ];
    });
  }

  function removeFile(path) {
    setSelectedFiles((prev) => prev.filter((f) => f.path !== path));
  }

  // Selected paths array for FileBrowser
  const selectedPaths = selectedFiles.map((f) => f.path);

  function getExpiresAt() {
    if (customExpiry) return new Date(customExpiry).toISOString();
    const hours = EXPIRY_PRESETS[expiryPreset].hours;
    return new Date(Date.now() + hours * 3600 * 1000).toISOString();
  }

  function totalSize() {
    const bytes = selectedFiles.reduce((sum, f) => {
      const n = parseFloat(f.entry?.size || 0);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    if (bytes === 0) return null;
    return humanSize(bytes);
  }

  function fail(msg) {
    setError(msg);
    showToast(msg, "error");
  }

  async function handleSubmit() {
    setError("");
    if (selectedFiles.length === 0) {
      return fail("Please select at least one file.");
    }
    if (selectedFiles.length > 1 && shareName.length === 0) {
      return fail("A share name is required when sharing multiple files.");
    }
    if (customExpiry && isNaN(Date.parse(customExpiry))) {
      return fail("Please enter a valid expiry date.");
    }
    if (customExpiry && new Date(customExpiry) <= new Date()) {
      return fail("Expiry date must be in the future.");
    }
    if (passwordEnabled && !password.trim()) {
      return fail("Please enter a password or disable password protection.");
    }
    if (
      downloadLimit &&
      (isNaN(parseInt(downloadLimit)) || parseInt(downloadLimit) < 1)
    ) {
      return fail("Download limit must be a positive number.");
    }

    setLoading(true);
    const { data, error: err } = await createShare({
      filePaths: selectedFiles.map((f) => f.path),
      expiresAt: getExpiresAt(),
      downloadLimit: downloadLimit ? parseInt(downloadLimit) : null,
      password: passwordEnabled ? password : null,
      maskFilenames,
      name: shareName.trim() || null,
    });
    setLoading(false);

    if (err) {
      setError(err);
      return;
    }
    setCreated(data);
  }

  function reset() {
    setCreated(null);
    setSelectedFiles([]);
    setPassword("");
    setPasswordEnabled(false);
    setDownloadLimit("");
    setCustomExpiry("");
    setMaskFilenames(false);
    setPanelCollapsed(false);
    setShareName("");
  }

  // ── Success state ─────────────────────────────────────
  if (created) {
    const shareUrl = buildShareUrl(shareBase, created.uuid);
    return (
      <div className="admin-wrap view-enter">
        <Topbar active="shares" onNavigate={onNavigate} />
        <div className="admin-content">
          <div
            style={{ maxWidth: 520, margin: "60px auto", textAlign: "center" }}
          >
            <div className="success-icon">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle
                  cx="14"
                  cy="14"
                  r="13"
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                />
                <path
                  d="M8 14l4 4 8-8"
                  stroke="var(--accent)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: "-0.02em",
                marginBottom: 8,
              }}
            >
              Share link created
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "var(--text-2)",
                marginBottom: 28,
                lineHeight: 1.6,
              }}
            >
              Copy the link below and send it to your recipient.
              {created.hasPassword && " They will be asked for a password."}
              {created.maskFilenames && " Filenames are masked."}
            </p>

            <div className="share-url-box">
              <span className="share-url-text">{shareUrl}</span>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
                style={{ flexShrink: 0 }}
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>

            <div className="share-details">
              {created.name && (
                <div className="share-detail-row">
                  <span>Share name</span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                    {created.name}
                  </span>
                </div>
              )}
              <div className="share-detail-row">
                <span>Files</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  {created.filePaths?.length} file
                  {created.filePaths?.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="share-detail-row">
                <span>Expires</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  {new Date(created.expiresAt).toLocaleString()}
                </span>
              </div>
              <div className="share-detail-row">
                <span>Download limit</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  {created.downloadLimit ?? "Unlimited"}
                </span>
              </div>
              <div className="share-detail-row">
                <span>Password protected</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  {created.hasPassword ? "Yes" : "No"}
                </span>
              </div>
              <div className="share-detail-row">
                <span>Filenames masked</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  {created.maskFilenames ? "Yes" : "No"}
                </span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "center",
                marginTop: 24,
              }}
            >
              <button className="btn btn-ghost" onClick={reset}>
                Create another
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => onNavigate("dashboard")}
              >
                Back to dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Create form ───────────────────────────────────────
  const size = totalSize();
  const count = selectedFiles.length;

  return (
    <div className="admin-wrap view-enter">
      <Topbar active="shares" onNavigate={onNavigate} />
      <div className="admin-content">
        <div className="page-header">
          <div>
            <div className="page-title">New Share</div>
            <div className="page-subtitle">
              Select one or more files, then configure settings
            </div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => onNavigate("dashboard")}
          >
            ← Back
          </button>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Share name — always shown, required indicator appears for multi-file */}
        <div style={{ marginBottom: 16 }}>
          <label
            className="form-label"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            Share Name
            {selectedFiles.length > 1 && (
              <span style={{ color: "var(--danger)", fontSize: 11 }}>
                required
              </span>
            )}
            {selectedFiles.length <= 1 && (
              <span
                style={{
                  color: "var(--text-3)",
                  fontSize: 11,
                  fontFamily: "var(--sans)",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontWeight: 400,
                }}
              >
                optional
              </span>
            )}
          </label>
          <input
            className="form-input"
            type="text"
            placeholder={
              selectedFiles.length > 1
                ? "e.g. Music Pack, Project Files…"
                : "e.g. Invoice March 2026 (optional)"
            }
            value={shareName}
            onChange={(e) => {
              setShareName(e.target.value);
              setError("");
            }}
            maxLength={100}
          />
        </div>

        <div className="create-layout">
          {/* File browser */}
          <FileBrowser
            selected={selectedPaths}
            onSelect={handleSelect}
            multiSelect
          />

          {/* Settings sidebar */}
          <div className="settings-col">
            {/* Selected files panel */}
            <div className="panel">
              <div
                className="panel-header"
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() => count > 0 && setPanelCollapsed((c) => !c)}
              >
                <span className="panel-title">
                  Selected Files
                  {count > 0 && (
                    <span
                      className="badge badge-accent"
                      style={{ marginLeft: 6 }}
                    >
                      {count}
                    </span>
                  )}
                  {panelCollapsed && size && (
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        color: "var(--text-2)",
                        marginLeft: 8,
                      }}
                    >
                      {size}
                    </span>
                  )}
                </span>
                {count > 0 && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    style={{
                      color: "var(--text-3)",
                      transition: "transform 0.2s",
                      transform: panelCollapsed
                        ? "rotate(-90deg)"
                        : "rotate(0deg)",
                      flexShrink: 0,
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
                )}
              </div>

              {!panelCollapsed && (
                <div className="panel-body" style={{ padding: "12px 16px" }}>
                  {count === 0 ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-3)",
                        textAlign: "center",
                        padding: "12px 0",
                        lineHeight: 1.6,
                      }}
                    >
                      Browse and click files on the left
                      <br />
                      to add them to your share
                    </div>
                  ) : (
                    <>
                      {/* Scrollable file list */}
                      <div
                        style={{
                          maxHeight: "30vh",
                          overflowY: "auto",
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                          scrollbarWidth: "thin",
                          scrollbarColor: "var(--border) transparent",
                        }}
                      >
                        {selectedFiles.map(({ path, entry }) => (
                          <div
                            key={path}
                            className="selected-file-preview"
                            style={{ marginBottom: 0 }}
                          >
                            <div
                              className="file-row-icon selected"
                              style={{ width: 28, height: 28, borderRadius: 4 }}
                            >
                              <FileTypeIcon
                                mimeType={getMimeTypeFromFilename(entry.name)}
                                size={13}
                                color="var(--accent)"
                              />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontFamily: "var(--mono)",
                                  fontSize: 11,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}
                              >
                                {entry.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-3)",
                                  marginTop: 1,
                                }}
                              >
                                {entry.sizeHuman || entry.size}
                              </div>
                            </div>
                            <button
                              onClick={() => removeFile(path)}
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: "50%",
                                border: "none",
                                background: "transparent",
                                color: "var(--text-3)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background =
                                  "var(--danger-light)";
                                e.currentTarget.style.color = "var(--danger)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background =
                                  "transparent";
                                e.currentTarget.style.color = "var(--text-3)";
                              }}
                              title="Remove"
                            >
                              <svg
                                width="9"
                                height="9"
                                viewBox="0 0 10 10"
                                fill="none"
                              >
                                <path
                                  d="M1 1l8 8M9 1L1 9"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Total size */}
                      {size && (
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            paddingTop: 10,
                            borderTop: "1px solid var(--border)",
                            marginTop: 8,
                            fontSize: 12,
                            color: "var(--text-2)",
                            fontFamily: "var(--mono)",
                          }}
                        >
                          <span>Total</span>
                          <strong style={{ color: "var(--text)" }}>
                            {size}
                          </strong>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Share settings */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Share Settings</span>
              </div>
              <div className="panel-body">
                <div className="settings-section">
                  <div className="settings-label">Expires after</div>
                  <div className="expiry-grid">
                    {EXPIRY_PRESETS.map((preset, i) => (
                      <button
                        key={i}
                        className={`expiry-btn ${expiryPreset === i && !customExpiry ? "active" : ""}`}
                        onClick={() => {
                          setExpiryPreset(i);
                          setCustomExpiry("");
                        }}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <input
                    className="input-small"
                    type="datetime-local"
                    value={customExpiry}
                    min={new Date(Date.now() + 60000)
                      .toISOString()
                      .slice(0, 16)}
                    onChange={(e) => {
                      setCustomExpiry(e.target.value);
                      setExpiryPreset(null);
                    }}
                    style={{ marginTop: 6 }}
                  />
                </div>

                <div className="settings-section">
                  <div className="settings-label">Download limit</div>
                  <input
                    className="input-small"
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={downloadLimit}
                    onChange={(e) => setDownloadLimit(e.target.value)}
                  />
                  <div className="form-hint" style={{ marginTop: 6 }}>
                    Leave blank for unlimited.
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-label">Protection</div>
                  <div className="toggle-row">
                    <div>
                      <div style={{ fontSize: 13 }}>Password protect</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-3)",
                          marginTop: 2,
                        }}
                      >
                        Recipient must enter a password
                      </div>
                    </div>
                    <div
                      className={`toggle ${passwordEnabled ? "on" : ""}`}
                      onClick={() => {
                        setPasswordEnabled((p) => !p);
                        setPassword("");
                      }}
                    />
                  </div>
                  {passwordEnabled && (
                    <input
                      className="input-small"
                      type="password"
                      placeholder="Set a password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{ marginTop: 10 }}
                      autoFocus
                    />
                  )}
                </div>

                <div className="settings-section">
                  <div className="settings-label">Privacy</div>
                  <div className="toggle-row">
                    <div>
                      <div style={{ fontSize: 13 }}>Mask filenames</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-3)",
                          marginTop: 2,
                        }}
                      >
                        Recipient sees sdrop-xxxx-1.pdf instead of real names
                      </div>
                    </div>
                    <div
                      className={`toggle ${maskFilenames ? "on" : ""}`}
                      onClick={() => setMaskFilenames((m) => !m)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%" }}
              onClick={handleSubmit}
              disabled={loading || selectedFiles.length === 0}
            >
              {loading ? (
                "Creating…"
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M13.5 9.5v4a1 1 0 01-1 1h-9a1 1 0 01-1-1v-4M8 1v9M5 7l3 3 3-3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Create Share Link
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function humanSize(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes,
    unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}
