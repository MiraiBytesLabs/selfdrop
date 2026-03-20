/**
 * All API calls to the SelfDrop backend.
 * Returns { data } on success or { error } on failure — never throws.
 */

function getToken() {
  return (
    localStorage.getItem("selfdrop_token") ||
    sessionStorage.getItem("selfdrop_token") ||
    null
  );
}

async function request(method, path, body = null, auth = true) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok)
      return { error: json.error || `Request failed (${res.status})` };
    return { data: json };
  } catch {
    return { error: "Network error — is the server running?" };
  }
}

// ── Auth ──────────────────────────────────────────────────
export const getAuthStatus = () => request("GET", "/api/auth/status");
export const setup = (username, password) =>
  request("POST", "/api/auth/setup", { username, password }, false);
export const login = (username, password) =>
  request("POST", "/api/auth/login", { username, password }, false);
export const logout = () => request("POST", "/api/auth/logout");

// ── Shares ────────────────────────────────────────────────
export const listShares = () => request("GET", "/api/shares");
export const getShare = (uuid) => request("GET", `/api/shares/${uuid}`);
export const createShare = (body) => request("POST", "/api/shares", body);
export const deleteShare = (uuid) => request("DELETE", `/api/shares/${uuid}`);

// ── Filesystem ────────────────────────────────────────────
export const listDirectory = (path = "/") =>
  request("GET", `/api/fs?path=${encodeURIComponent(path)}`);
export const getFileInfo = (path) =>
  request("GET", `/api/fs/info?path=${encodeURIComponent(path)}`);
