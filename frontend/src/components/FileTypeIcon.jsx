/**
 * FileTypeIcon — renders a contextual icon based on MIME type.
 * Used in the dashboard shares table and the public download page.
 *
 * Props:
 *   mimeType (string) — e.g. "audio/mpeg", "application/pdf"
 *   size     (number) — icon size in px, default 14
 *   color    (string) — stroke color, default "currentColor"
 */
export default function FileTypeIcon({
  mimeType,
  size = 14,
  color = "currentColor",
}) {
  const category = getFileCategory(mimeType);
  const s = size;

  switch (category) {
    case "audio":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M9 18V5l12-2v13"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="6" cy="18" r="3" stroke={color} strokeWidth="1.4" />
          <circle cx="18" cy="16" r="3" stroke={color} strokeWidth="1.4" />
        </svg>
      );
    case "video":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <rect
            x="2"
            y="4"
            width="15"
            height="16"
            rx="2"
            stroke={color}
            strokeWidth="1.4"
          />
          <path
            d="M17 8.5l5-3v13l-5-3V8.5z"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "pdf":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8L14 2z"
            stroke={color}
            strokeWidth="1.4"
          />
          <path d="M14 2v6h6" stroke={color} strokeWidth="1.4" />
          <path
            d="M8 13h2.5a1.5 1.5 0 010 3H8v-3z"
            stroke={color}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M14 13h1a2 2 0 010 4h-1v-4z"
            stroke={color}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M17 13v4M17 15h2"
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "image":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="2"
            stroke={color}
            strokeWidth="1.4"
          />
          <circle cx="8.5" cy="8.5" r="1.5" stroke={color} strokeWidth="1.4" />
          <path
            d="M21 15l-5-5L5 21"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "text":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8L14 2z"
            stroke={color}
            strokeWidth="1.4"
          />
          <path d="M14 2v6h6" stroke={color} strokeWidth="1.4" />
          <path
            d="M8 13h8M8 17h5"
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "archive":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M21 8H3M21 8v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8M21 8l-2-5H5L3 8"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M10 12h4M12 12v4"
            stroke={color}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "lock":
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          fill="none"
          className="file-icon-lock"
        >
          <rect
            x="5"
            y="11"
            width="14"
            height="10"
            rx="2"
            stroke={color}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M8 11V7a4 4 0 018 0v4"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="16" r="1.5" fill={color} />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path
            d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9L13 2z"
            stroke={color}
            strokeWidth="1.4"
          />
          <path d="M13 2v7h7" stroke={color} strokeWidth="1.4" />
        </svg>
      );
  }
}

export function getFileCategory(mimeType) {
  if (!mimeType) return "generic";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("text/")) return "text";
  if (
    mimeType.includes("zip") ||
    mimeType.includes("tar") ||
    mimeType.includes("gzip") ||
    mimeType.includes("compressed")
  )
    return "archive";
  if (mimeType == "lock") return "lock";
  return "generic";
}
