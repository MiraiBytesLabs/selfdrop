import { useState, useEffect } from "react";
import Topbar from "../components/Topbar.jsx";
import Dialog from "../components/Dialog.jsx";
import { listShares, deleteShare } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import { useAuth } from "../store.jsx";
import FileTypeIcon, { getFileCategory } from "../components/FileTypeIcon.jsx";
import { formatExpiry, isExpiringSoon } from "../utils/formatDate.js";
import { getMimeTypeFromFilename } from "../utils/fileUtils.js";
import { useShareUrl, buildShareUrl } from "../utils/useShareUrl.js";

export default function Dashboard({ onNavigate }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revokeUuid, setRevokeUuid] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | active | expired | limit_reached
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const showToast = useToast();
  const { clearToken } = useAuth();
  const { shareBase } = useShareUrl();

  useEffect(() => {
    fetchShares();
  }, []);

  // Reset to page 1 whenever search or filter changes
  useEffect(() => {
    setPage(1);
  }, [search, filter]);

  async function fetchShares() {
    setLoading(true);
    const { data, error } = await listShares();
    setLoading(false);

    if (error) {
      if (error.includes("Authentication")) {
        clearToken();
        onNavigate("login");
        return;
      }
      showToast(error, "error");
      return;
    }
    setShares(data.shares || []);
  }

  async function handleRevoke() {
    if (!revokeUuid) return;
    setRevoking(true);
    const { error } = await deleteShare(revokeUuid);
    setRevoking(false);
    setRevokeUuid(null);

    if (error) {
      showToast(error, "error");
      return;
    }
    showToast("Share revoked.", "success");
    fetchShares();
  }

  function copyLink(uuid) {
    const url = buildShareUrl(shareBase, uuid);
    navigator.clipboard
      .writeText(url)
      .then(() => showToast("Share link copied.", "success"))
      .catch(() => showToast("Could not copy to clipboard.", "error"));
  }

  // ── Stats ────────────────────────────────────────────────
  const active = shares.filter((s) => s.status === "active").length;
  const expired = shares.filter((s) => s.status !== "active").length;
  const downloads = shares.reduce((n, s) => n + (s.downloadCount || 0), 0);
  const expiringSoon = shares.filter((s) => {
    if (s.status !== "active") return false;
    return new Date(s.expiresAt) - new Date() < 86400000;
  }).length;

  // ── Derived state ────────────────────────────────────
  const filtered = shares
    .filter((s) => filter === "all" || s.status === filter)
    .filter((s) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      const name = (s.name || "").toLowerCase();
      const file = (s.filePaths?.[0]?.split("/").pop() || "").toLowerCase();
      return name.includes(q) || file.includes(q);
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="admin-wrap view-enter">
      <Topbar active="shares" onNavigate={onNavigate} />

      <div className="admin-content">
        <div className="page-header">
          <div>
            <div className="page-title">File Shares</div>
            <div className="page-subtitle">
              Manage active and expired share links
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => onNavigate("create")}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1v14M1 8h14"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            New Share
          </button>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Active Shares</div>
            <div className="stat-value">{loading ? "—" : active}</div>
            <div className="stat-sub">
              {expiringSoon > 0 ? `${expiringSoon} expiring soon` : "all good"}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Downloads</div>
            <div className="stat-value">{loading ? "—" : downloads}</div>
            <div className="stat-sub">across all shares</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Expired</div>
            <div className="stat-value">{loading ? "—" : expired}</div>
            <div className="stat-sub">all time</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Shares</div>
            <div className="stat-value">{loading ? "—" : shares.length}</div>
            <div className="stat-sub">created</div>
          </div>
        </div>

        {/* Table */}
        <div className="table-card">
          <div className="table-header" style={{ flexWrap: "wrap", gap: 10 }}>
            <span className="table-title">All Shares</span>
            {/* Search */}
            <div style={{ position: "relative", marginLeft: "auto" }}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                style={{
                  position: "absolute",
                  left: 9,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-3)",
                  pointerEvents: "none",
                }}
              >
                <circle
                  cx="6.5"
                  cy="6.5"
                  r="4.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                />
                <path
                  d="M10 10l3 3"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
              <input
                type="text"
                placeholder="Search shares…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  paddingLeft: 28,
                  paddingRight: 10,
                  paddingTop: 6,
                  paddingBottom: 6,
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontFamily: "var(--sans)",
                  fontSize: 12,
                  outline: "none",
                  width: 180,
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
          </div>

          {/* Filter pills */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "10px 20px",
              borderBottom: "1px solid var(--border)",
              flexWrap: "wrap",
            }}
          >
            {[
              { key: "all", label: "All" },
              { key: "active", label: "Active" },
              { key: "expired", label: "Expired" },
              { key: "limit_reached", label: "Limit Reached" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 100,
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  border: "1px solid",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  borderColor:
                    filter === key ? "var(--accent)" : "var(--border)",
                  background:
                    filter === key ? "var(--accent-light)" : "var(--surface)",
                  color: filter === key ? "var(--accent)" : "var(--text-3)",
                  fontWeight: filter === key ? 500 : 400,
                }}
                className="dashboard-filter--pill"
              >
                {label}
                <span style={{ marginLeft: 5, opacity: 0.7 }}>
                  {key === "all"
                    ? shares.length
                    : shares.filter((s) => s.status === key).length}
                </span>
              </button>
            ))}
          </div>

          {loading ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: "var(--text-3)",
                fontSize: 13,
              }}
            >
              Loading shares…
            </div>
          ) : shares.length === 0 ? (
            <EmptyState onNavigate={onNavigate} />
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: "40px",
                textAlign: "center",
                color: "var(--text-3)",
                fontSize: 13,
              }}
            >
              No shares match your search or filter.
            </div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Token</th>
                    <th>Status</th>
                    <th>Downloads</th>
                    <th>Expires</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((share) => (
                    <ShareRow
                      key={share.uuid}
                      share={share}
                      onCopy={() => copyLink(share.uuid)}
                      onRevoke={() => setRevokeUuid(share.uuid)}
                    />
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 20px",
                    borderTop: "1px solid var(--border)",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--text-3)",
                      fontFamily: "var(--mono)",
                    }}
                  >
                    {(currentPage - 1) * PAGE_SIZE + 1}–
                    {Math.min(currentPage * PAGE_SIZE, filtered.length)} of{" "}
                    {filtered.length}
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      className="icon-btn"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      title="Previous page"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M10 3L5 8l5 5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(
                        (p) =>
                          p === 1 ||
                          p === totalPages ||
                          Math.abs(p - currentPage) <= 1,
                      )
                      .reduce((acc, p, idx, arr) => {
                        if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, idx) =>
                        p === "…" ? (
                          <span
                            key={`ellipsis-${idx}`}
                            style={{
                              width: 28,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              color: "var(--text-3)",
                            }}
                          >
                            …
                          </span>
                        ) : (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            style={{
                              borderRadius: "var(--radius)",
                              border: "1px solid",
                              cursor: "pointer",
                              fontSize: 12,
                              fontFamily: "var(--mono)",
                              transition: "all 0.15s",
                              borderColor:
                                p === currentPage
                                  ? "var(--accent)"
                                  : "var(--border)",
                              background:
                                p === currentPage
                                  ? "var(--accent-light)"
                                  : "var(--surface)",
                              color:
                                p === currentPage
                                  ? "var(--accent)"
                                  : "var(--text-2)",
                              fontWeight: p === currentPage ? 500 : 400,
                            }}
                            className="dashboard-pagination--btn"
                          >
                            {p}
                          </button>
                        ),
                      )}
                    <button
                      className="icon-btn"
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                      title="Next page"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M6 3l5 5-5 5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Revoke dialog */}
      {revokeUuid && (
        <Dialog
          title="Revoke this share?"
          body="The share link will stop working immediately. This cannot be undone."
          onConfirm={handleRevoke}
          onCancel={() => setRevokeUuid(null)}
          loading={revoking}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function ShareRow({ share, onCopy, onRevoke }) {
  const [copied, setCopied] = useState(false);
  const filename = share.filePaths?.[0]?.split("/").pop() || "—";
  const shortUuid = share.uuid.split("-")[0];

  const isMultiFileShare = share.filePaths && share.filePaths.length > 1;
  const isPasswordProtected = share.hasPassword;

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const badge = {
    active: <span className="badge badge-active">active</span>,
    expired: <span className="badge badge-expired">expired</span>,
    limit_reached: <span className="badge badge-limited">limit reached</span>,
  }[share.status];

  const dlColor =
    share.status === "limit_reached" ? "var(--warning)" : "inherit";
  const dlText = share.downloadLimit
    ? `${share.downloadCount} / ${share.downloadLimit}`
    : `${share.downloadCount} / ∞`;

  return (
    <tr>
      <td>
        <div className="td-filename">
          <div className="file-icon">
            <FileTypeIcon
              mimeType={
                isMultiFileShare
                  ? "compressed"
                  : getMimeTypeFromFilename(filename)
              }
              size={14}
            />
            {isPasswordProtected && (
              <FileTypeIcon mimeType={"lock"} size={12} />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {share.name || filename}
            </div>
            {share.name && (
              <div
                style={{
                  fontSize: 10,
                  color: "var(--text-3)",
                  fontFamily: "var(--sans)",
                  fontWeight: 400,
                  marginTop: 1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {share.filePaths?.length > 1
                  ? `${share.filePaths.length} files`
                  : filename}
              </div>
            )}
          </div>
        </div>
      </td>
      <td>
        <span
          className={`token-chip ${copied ? "copied" : ""}`}
          onClick={handleCopy}
          title="Click to copy share link"
        >
          {copied ? "copied!" : shortUuid}
        </span>
      </td>
      <td>{badge}</td>
      <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: dlColor }}>
        {dlText}
      </td>
      <td
        style={{
          fontSize: 12,
          color: isExpiringSoon(share.expiresAt)
            ? "var(--warning)"
            : share.status === "active"
              ? "var(--text-2)"
              : "var(--text-3)",
        }}
      >
        {formatExpiry(share.expiresAt)}
      </td>
      <td>
        <div className="td-actions">
          <button
            className="icon-btn"
            onClick={handleCopy}
            title="Copy share link"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect
                x="5"
                y="5"
                width="9"
                height="9"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <path
                d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            </svg>
          </button>
          <button
            className="icon-btn danger"
            onClick={onRevoke}
            title="Revoke share"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 2l12 12M14 2L2 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}

function EmptyState({ onNavigate }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
          <path
            d="M9 1H3a1 1 0 00-1 1v12a1 1 0 001 1h10a1 1 0 001-1V6L9 1z"
            stroke="var(--text-3)"
            strokeWidth="1.2"
          />
          <path d="M9 1v5h5" stroke="var(--text-3)" strokeWidth="1.2" />
        </svg>
      </div>
      <div className="empty-title">No shares yet</div>
      <div className="empty-sub">Create a share link to get started.</div>
      <button
        className="btn btn-secondary"
        onClick={() => onNavigate("create")}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1v14M1 8h14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        New Share
      </button>
    </div>
  );
}
