import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./store.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import Setup from "./views/Setup.jsx";
import Login from "./views/Login.jsx";
import Dashboard from "./views/Dashboard.jsx";
import CreateShare from "./views/CreateShare.jsx";
import Download from "./views/Download.jsx";
import { getAuthStatus } from "./api.js";

function getShareUuid() {
  const match = window.location.pathname.match(/^\/share\/([a-f0-9-]+)$/i);
  return match ? match[1] : null;
}

function Inner() {
  const { getToken, clearToken } = useAuth();
  const [view, setView] = useState(null);
  const [booting, setBooting] = useState(true);
  const shareUuid = getShareUuid();

  useEffect(() => {
    if (shareUuid) {
      setBooting(false);
      setView("download");
      return;
    }
    boot();
  }, []);

  async function boot() {
    const { data, error } = await getAuthStatus();

    if (error || !data) {
      // Server unreachable — try dashboard if token exists,
      // API calls will redirect to login on 401
      setView(getToken() ? "dashboard" : "login");
      setBooting(false);
      return;
    }

    if (!data.configured) {
      setView("setup");
      setBooting(false);
      return;
    }

    // Token was sent with status request — authenticated is now reliable
    if (data.authenticated) {
      setView("dashboard");
    } else {
      // Token missing, invalid, or expired — clear and go to login
      clearToken();
      setView("login");
    }
    setBooting(false);
  }

  function navigate(target) {
    setView(target);
    if (target !== "download") window.history.pushState({}, "", "/");
  }

  if (booting) return <div className="loading-wrap">loading…</div>;

  return (
    <>
      {view === "setup" && <Setup onDone={navigate} />}
      {view === "login" && <Login onDone={navigate} />}
      {view === "dashboard" && <Dashboard onNavigate={navigate} />}
      {view === "create" && <CreateShare onNavigate={navigate} />}
      {view === "download" && <Download uuid={shareUuid} />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Inner />
      </ToastProvider>
    </AuthProvider>
  );
}
