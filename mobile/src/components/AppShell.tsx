import { JSX } from "solid-js";
import { useNavigate, useLocation } from "@solidjs/router";
import OfflineBanner from "./OfflineBanner";
import "./AppShell.css";

interface AppShellProps {
  children: JSX.Element;
}

export default function AppShell(props: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div class="app-shell">
      <header class="app-bar">
        <span class="app-bar-title">Project Memory</span>
        <button
          class="app-bar-settings"
          onClick={() => navigate("/setup")}
          title="Setup"
        >
          ⚙
        </button>
      </header>

      <OfflineBanner />

      <main class="app-content">
        {props.children}
      </main>

      <nav class="bottom-nav">
        <button
          class={`nav-tab ${isActive("/dashboard") ? "active" : ""}`}
          onClick={() => navigate("/dashboard")}
        >
          <span class="nav-icon">🏠</span>
          <span class="nav-label">Dashboard</span>
        </button>
        <button
          class={`nav-tab ${isActive("/chat") ? "active" : ""}`}
          onClick={() => navigate("/chat")}
        >
          <span class="nav-icon">💬</span>
          <span class="nav-label">Chat</span>
        </button>
        <button
          class={`nav-tab ${isActive("/terminal") ? "active" : ""}`}
          onClick={() => navigate("/terminal/main")}
        >
          <span class="nav-icon">⌨</span>
          <span class="nav-label">Terminal</span>
        </button>
        <button
          class={`nav-tab ${isActive("/discovery") ? "active" : ""}`}
          onClick={() => navigate("/discovery")}
        >
          <span class="nav-icon">🔍</span>
          <span class="nav-label">Connect</span>
        </button>
      </nav>
    </div>
  );
}
