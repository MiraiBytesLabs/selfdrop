import { useState, useRef, useEffect } from "react";
import Logo from "./Logo.jsx";
import { useAuth } from "../store.jsx";
import { logout } from "../api.js";
import { useDarkMode } from "../utils/useDarkMode.js";

export default function Topbar({ active, onNavigate }) {
  const { username, clearToken } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const avatarRef = useRef(null);
  const { dark, toggle: toggleDark } = useDarkMode();

  // Close menu when clicking outside
  useEffect(() => {
    function handler(e) {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  async function handleLogout() {
    await logout();
    clearToken();
    onNavigate("login");
  }

  const initial = (username || "A")[0].toUpperCase();

  return (
    <div className="topbar">
      <Logo />
      <div className="topbar-divider" />
      <nav className="topbar-nav">
        <button
          className={`topbar-nav-item ${active === "shares" ? "active" : ""}`}
          onClick={() => onNavigate("dashboard")}
        >
          Shares
        </button>
        <button
          className={`topbar-nav-item ${active === "settings" ? "active" : ""}`}
          onClick={() => onNavigate("settings")}
        >
          Settings
        </button>
      </nav>
      <div className="topbar-right">
        <button
          className="btn btn-secondary"
          style={{ padding: "6px 12px", fontSize: 13 }}
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
          <span>New Share</span>
        </button>
        <div
          className="avatar"
          ref={avatarRef}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {initial}
          {menuOpen && (
            <div className="avatar-menu">
              <div className="avatar-menu-label">Signed in as</div>
              <div className="avatar-menu-user">{username || "admin"}</div>
              <div className="avatar-menu-divider" />

              {/* Dark mode toggle */}
              <button
                className="avatar-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDark();
                }}
              >
                {dark ? <SunIcon /> : <MoonIcon />}
                {dark ? "Light mode" : "Dark mode"}
                <span
                  className="avatar-menu-toggle"
                  style={{ marginLeft: "auto" }}
                >
                  <span className={`mini-toggle ${dark ? "on" : ""}`} />
                </span>
              </button>

              <div className="avatar-menu-divider" />
              <button
                className="avatar-menu-item danger"
                onClick={handleLogout}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M6 2H2v12h4M11 11l3-3-3-3M14 8H6"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path
        d="M13.5 10.5A6 6 0 015.5 2.5a6 6 0 000 11 6 6 0 008-3z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
