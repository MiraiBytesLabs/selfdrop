import { useState, useEffect, useRef, useCallback } from "react";
import FileTypeIcon, { getFileCategory } from "./FileTypeIcon.jsx";

const PREVIEW_SIZE_LIMIT = 200 * 1024 * 1024; // 200MB — matches PREVIEW_MAX_BYTES default in backend

export default function PreviewModal({
  files,
  initialIndex,
  uuid,
  password,
  onClose,
}) {
  const [index, setIndex] = useState(initialIndex ?? 0);
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const prevBlobRef = useRef(null);

  const file = files[index];
  const category = getFileCategory(file?.mimeType);
  const canPreview = ["image", "audio", "video"].includes(category);
  const tooBig =
    file?.size > PREVIEW_SIZE_LIMIT && ["video", "audio"].includes(category);

  // ── Navigation ──────────────────────────────────────────
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + files.length) % files.length),
    [files.length],
  );
  const next = useCallback(
    () => setIndex((i) => (i + 1) % files.length),
    [files.length],
  );

  useEffect(() => {
    function handler(e) {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [prev, next, onClose]);

  // ── Blob URL lifecycle ──────────────────────────────────
  // Always fetch via JS and create a blob URL for preview.
  // This ensures the file bytes flow correctly regardless of whether
  // X-Accel-Redirect is in play — browsers can't handle that header
  // on direct <img>/<audio>/<video> src requests.
  useEffect(() => {
    // Revoke previous blob
    if (prevBlobRef.current) {
      URL.revokeObjectURL(prevBlobRef.current);
      prevBlobRef.current = null;
    }
    setBlobUrl(null);
    setError("");

    if (!canPreview || tooBig) return;

    let cancelled = false;
    setLoading(true);

    const headers = {};
    if (password) headers["X-Share-Password"] = password;

    fetch(`/s/${uuid}/preview/${encodeURIComponent(file.filename)}`, {
      headers,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Preview failed (${res.status}).`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        prevBlobRef.current = url;
        setBlobUrl(url);
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [index, uuid, password, canPreview, tooBig]);

  // Revoke on unmount
  useEffect(
    () => () => {
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
    },
    [],
  );

  // ── Download helper ─────────────────────────────────────
  function downloadFile() {
    const headers = password ? { "X-Share-Password": password } : {};
    fetch(`/s/${uuid}/preview/${encodeURIComponent(file.filename)}`, {
      headers,
    })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.filename;
        a.click();
      });
  }

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div
        className={`preview-modal preview-modal--${category}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="preview-modal__header">
          <div className="preview-modal__title">
            <FileTypeIcon mimeType={file.mimeType} size={14} />
            <span>{file.filename}</span>
            <span className="preview-modal__size">{file.sizeHuman}</span>
          </div>
          <div className="preview-modal__header-actions">
            {files.length > 1 && (
              <span className="preview-modal__counter">
                {index + 1} / {files.length}
              </span>
            )}
            <button
              className="preview-modal__btn"
              onClick={downloadFile}
              title="Download"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 1v9M5 7l3 3 3-3M2 14h12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className="preview-modal__btn"
              onClick={onClose}
              title="Close (Esc)"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 2l12 12M14 2L2 14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="preview-modal__body">
          {files.length > 1 && (
            <button
              className="preview-modal__arrow preview-modal__arrow--left"
              onClick={prev}
              title="Previous (←)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 3L5 8l5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}

          <div className="preview-modal__content">
            {loading && <PreviewLoading />}
            {!loading && error && (
              <PreviewError message={error} onDownload={downloadFile} />
            )}
            {!loading && !error && tooBig && (
              <PreviewTooBig file={file} onDownload={downloadFile} />
            )}
            {!loading && !error && !tooBig && (
              <PreviewContent
                category={category}
                file={file}
                blobUrl={blobUrl}
                onDownload={downloadFile}
              />
            )}
          </div>

          {files.length > 1 && (
            <button
              className="preview-modal__arrow preview-modal__arrow--right"
              onClick={next}
              title="Next (→)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Thumbnail strip */}
        {files.length > 1 && (
          <div className="preview-modal__strip">
            {files.map((f, i) => (
              <button
                key={f.path}
                className={`preview-modal__strip-item ${i === index ? "active" : ""}`}
                onClick={() => setIndex(i)}
                title={f.filename}
              >
                <FileTypeIcon mimeType={f.mimeType} size={12} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function PreviewContent({ category, file, blobUrl, onDownload }) {
  // Show loading spinner while blob is being fetched
  if (["image", "audio", "video"].includes(category) && !blobUrl) {
    return <PreviewLoading />;
  }

  switch (category) {
    case "image":
      return (
        <div className="preview-image">
          <img src={blobUrl} alt={file.filename} />
        </div>
      );

    case "audio":
      return (
        <div className="preview-audio">
          <div className="preview-audio__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 18V5l12-2v13"
                stroke="var(--accent)"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="6"
                cy="18"
                r="3"
                stroke="var(--accent)"
                strokeWidth="1.4"
              />
              <circle
                cx="18"
                cy="16"
                r="3"
                stroke="var(--accent)"
                strokeWidth="1.4"
              />
            </svg>
          </div>
          <div className="preview-audio__name">{file.filename}</div>
          <div className="preview-audio__size">{file.sizeHuman}</div>
          <audio controls src={blobUrl} className="preview-audio__player" />
        </div>
      );

    case "video":
      return (
        <div className="preview-video">
          <video controls src={blobUrl} className="preview-video__player" />
        </div>
      );

    default:
      return (
        <div className="preview-generic">
          <div className="preview-generic__icon">
            <FileTypeIcon
              mimeType={file.mimeType}
              size={40}
              color="var(--text-3)"
            />
          </div>
          <div className="preview-generic__name">{file.filename}</div>
          <div className="preview-generic__size">{file.sizeHuman}</div>
          <div className="preview-generic__note">
            No preview available for this file type.
          </div>
          <button
            className="preview-state__btn"
            onClick={onDownload}
            style={{ marginTop: 8 }}
          >
            Download file
          </button>
        </div>
      );
  }
}

function PreviewLoading() {
  return (
    <div className="preview-state">
      <div className="preview-state__spinner" />
      <div className="preview-state__text">Loading preview…</div>
    </div>
  );
}

function PreviewError({ message, onDownload }) {
  return (
    <div className="preview-state">
      <div className="preview-state__text" style={{ color: "var(--danger)" }}>
        {message}
      </div>
      <button className="preview-state__btn" onClick={onDownload}>
        Download instead
      </button>
    </div>
  );
}

function PreviewTooBig({ file, onDownload }) {
  return (
    <div className="preview-state">
      <div className="preview-generic__icon">
        <FileTypeIcon
          mimeType={file.mimeType}
          size={40}
          color="var(--text-3)"
        />
      </div>
      <div className="preview-state__text">
        File is too large to preview ({file.sizeHuman})
      </div>
      <button className="preview-state__btn" onClick={onDownload}>
        Download file
      </button>
    </div>
  );
}
