/**
 * Formats an expiry date/datetime string for display.
 *
 * - < 1 min remaining  → "< 1 min"
 * - < 60 mins          → "42 mins"
 * - < 24 hours         → "2h 30m"
 * - >= 24 hours        → "Mar 25, 2026"
 * - expired            → "Expired"
 */
export function formatExpiry(iso) {
  if (!iso) return "—";

  const now = new Date();
  const expiry = new Date(iso);
  const diffMs = expiry - now;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMs <= 0) return "Expired";
  if (diffSecs < 60) return "< 1 min";
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""}`;

  if (diffHours < 24) {
    const remainingMins = diffMins % 60;
    return remainingMins === 0
      ? `${diffHours}h`
      : `${diffHours}h ${remainingMins}m`;
  }

  return expiry.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Returns true if expiry is within 24 hours but not yet expired.
 */
export function isExpiringSoon(iso) {
  if (!iso) return false;
  const diffMs = new Date(iso) - new Date();
  return diffMs > 0 && diffMs < 1000 * 60 * 60 * 24;
}
