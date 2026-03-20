import { useState, useEffect } from "react";
import { listDirectory } from "../api.js";
import FileTypeIcon from "./FileTypeIcon.jsx";
import { getMimeTypeFromFilename } from "../utils/fileUtils.js";

/**
 * FileBrowser — lets the admin navigate /data/files and select files.
 *
 * Props:
 *   onSelect(filePath, entry) — called when a file is clicked
 *   selected                  — selected path (string) or array of paths
 *   multiSelect               — if true, multiple files can be selected
 */
export default function FileBrowser({
  onSelect,
  selected,
  multiSelect = false,
}) {
  // Normalise selected to always be a Set for easy lookup
  const selectedSet = new Set(
    Array.isArray(selected) ? selected : selected ? [selected] : [],
  );
  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState([]);
  const [parent, setParent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    navigate(path);
  }, []);

  async function navigate(newPath) {
    setLoading(true);
    setError("");

    const { data, error: err } = await listDirectory(newPath);
    setLoading(false);

    if (err) {
      setError(err);
      return;
    }

    setPath(newPath);
    setEntries(data.entries || []);
    setParent(data.parent ?? null);
  }

  function handleClick(entry) {
    if (entry.type === "directory") {
      navigate(entry.path);
      return;
    }
    // In multi-select mode, always pass path + entry — parent manages toggle
    // In single-select mode, toggle off if already selected
    if (!multiSelect && selectedSet.has(entry.path)) {
      onSelect(null);
    } else {
      onSelect(entry.path, entry);
    }
  }

  // Build breadcrumb segments from path
  function breadcrumbs() {
    const parts = path.split("/").filter(Boolean);
    const crumbs = [{ label: "files", path: "/" }];
    let built = "";
    for (const part of parts) {
      built += "/" + part;
      crumbs.push({ label: part, path: built });
    }
    return crumbs;
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">
          <FolderIcon size={13} />
          File Browser
        </span>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--text-3)",
          }}
        >
          /
        </span>
      </div>

      {/* Breadcrumb */}
      <div className="breadcrumb">
        {breadcrumbs().map((crumb, i, arr) => (
          <span
            key={crumb.path}
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            {i > 0 && <span style={{ color: "var(--border-strong)" }}>/</span>}
            <span
              style={{
                color: i === arr.length - 1 ? "var(--text-3)" : "var(--text-2)",
                cursor: i === arr.length - 1 ? "default" : "pointer",
              }}
              onClick={() => i < arr.length - 1 && navigate(crumb.path)}
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="browser-loading">Loading…</div>
      ) : error ? (
        <div className="browser-error">{error}</div>
      ) : (
        <ul className="file-list">
          {/* Parent directory row */}
          {parent !== null && (
            <li className="file-row" onClick={() => navigate(parent)}>
              <div className="file-row-icon">
                <FolderIcon size={14} />
              </div>
              <div className="file-row-info">
                <div className="file-row-name">..</div>
                <div className="file-row-meta">parent directory</div>
              </div>
            </li>
          )}

          {entries.length === 0 && (
            <li
              style={{
                padding: "20px",
                textAlign: "center",
                color: "var(--text-3)",
                fontSize: 13,
              }}
            >
              Empty directory
            </li>
          )}

          {entries.map((entry) => {
            const isSelected = selectedSet.has(entry.path);
            return (
              <li
                key={entry.path}
                className={`file-row ${isSelected ? "selected" : ""}`}
                onClick={() => handleClick(entry)}
              >
                <div
                  className={`file-row-icon ${isSelected ? "selected" : ""}`}
                >
                  {entry.type === "directory" ? (
                    <FolderIcon
                      size={14}
                      color={isSelected ? "var(--accent)" : undefined}
                    />
                  ) : (
                    <FileTypeIcon
                      mimeType={getMimeTypeFromFilename(entry.name)}
                      size={14}
                      color={isSelected ? "var(--accent)" : "currentColor"}
                    />
                  )}
                </div>
                <div className="file-row-info">
                  <div className="file-row-name">{entry.name}</div>
                  <div className="file-row-meta">
                    {entry.type === "directory"
                      ? "directory"
                      : entry.mimeType?.split("/")[1]?.toUpperCase() || "FILE"}
                  </div>
                </div>
                {entry.type === "file" && (
                  <div className="file-row-size">{entry.sizeHuman}</div>
                )}
                {entry.type === "file" && (
                  <div
                    className={`selected-indicator ${isSelected ? "visible" : ""}`}
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2 5l2.5 2.5L8 2.5"
                        stroke="#fff"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────

function FolderIcon({ size = 14, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M1 3a1 1 0 011-1h4l2 2h6a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3z"
        stroke={color}
        strokeWidth="1.2"
      />
    </svg>
  );
}
