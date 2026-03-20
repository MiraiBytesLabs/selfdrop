/**
 * Infers a MIME type from a filename extension.
 * Used when only the filename is available (dashboard, file browser).
 */
export function getMimeTypeFromFilename(filename) {
  if (!filename) return null;
  const ext = filename.split(".").pop().toLowerCase();
  const map = {
    mp3: "audio/mpeg",
    aac: "audio/aac",
    wav: "audio/wav",
    flac: "audio/flac",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    mp4: "video/mp4",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    webm: "video/webm",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    zip: "application/zip",
    tar: "application/x-tar",
    gz: "application/gzip",
    rar: "application/x-rar-compressed",
  };
  return map[ext] || null;
}
