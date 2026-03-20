import { useState, useEffect } from "react";
import { getSettings } from "../api.js";

/**
 * Returns the base URL to use for share links.
 * Uses public_url from settings if configured, otherwise window.location.origin.
 *
 * @returns {{ shareBase: string, loading: boolean }}
 */
export function useShareUrl() {
  const [shareBase, setShareBase] = useState(window.location.origin);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSettings().then(({ data }) => {
      if (data?.public_url) {
        setShareBase(data.public_url);
      }
      setLoading(false);
    });
  }, []);

  return { shareBase, loading };
}

/**
 * Builds a full share link from a UUID.
 * @param {string} base  — e.g. https://files.yourdomain.com
 * @param {string} uuid
 * @returns {string}
 */
export function buildShareUrl(base, uuid) {
  return `${base}/share/${uuid}`;
}
