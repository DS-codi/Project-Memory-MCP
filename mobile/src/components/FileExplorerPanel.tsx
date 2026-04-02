import {
  createSignal,
  createResource,
  For,
  Show,
  onMount,
} from "solid-js";
import { getFileRoots, browseDirectory, type FileEntry } from "../services/filesApi";
import "./FileExplorerPanel.css";

interface FileExplorerPanelProps {
  class?: string;
}

export default function FileExplorerPanel(props: FileExplorerPanelProps) {
  const [roots] = createResource(getFileRoots);
  const [activeRoot, setActiveRoot] = createSignal(0);
  const [currentPath, setCurrentPath] = createSignal<string | null>(null);
  const [browseResult, setBrowseResult] = createSignal<{
    path: string;
    parent: string | null;
    entries: FileEntry[];
  } | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function navigate(path: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await browseDirectory(path);
      setBrowseResult(result);
      setCurrentPath(path);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load directory");
    } finally {
      setLoading(false);
    }
  }

  // When roots load, navigate to the first root automatically
  function handleRootChange(idx: number) {
    setActiveRoot(idx);
    const rootList = roots();
    if (rootList && rootList[idx]) {
      navigate(rootList[idx]);
    }
  }

  onMount(() => {
    // Navigate once roots are available
    const check = setInterval(() => {
      const rootList = roots();
      if (rootList && rootList.length > 0) {
        clearInterval(check);
        navigate(rootList[0]);
      }
    }, 200);
  });

  function breadcrumbs(): { label: string; path: string }[] {
    const path = currentPath();
    if (!path) return [];
    // Split on both / and \
    const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts.map((part, i) => ({
      label: part,
      // Reconstruct the OS path up to this segment
      path: path.includes("\\")
        ? parts.slice(0, i + 1).join("\\").replace(/^([A-Za-z])\\/, "$1:\\")
        : "/" + parts.slice(0, i + 1).join("/"),
    }));
  }

  return (
    <div class={`file-explorer${props.class ? " " + props.class : ""}`}>
      {/* Root tabs */}
      <Show when={roots() && roots()!.length > 1}>
        <div class="fe-root-tabs">
          <For each={roots()}>
            {(root, i) => {
              const label = root.replace(/\\/g, "/").split("/").pop() ?? root;
              return (
                <button
                  class={`fe-root-tab${i() === activeRoot() ? " active" : ""}`}
                  onClick={() => handleRootChange(i())}
                  title={root}
                >
                  {label}
                </button>
              );
            }}
          </For>
        </div>
      </Show>

      {/* Breadcrumb bar */}
      <div class="fe-breadcrumb">
        <Show when={browseResult()?.parent}>
          <button
            class="fe-breadcrumb-up"
            onClick={() => navigate(browseResult()!.parent!)}
            title="Go up"
          >
            ↑
          </button>
        </Show>
        <div class="fe-breadcrumb-path">
          <For each={breadcrumbs()}>
            {(crumb, i) => (
              <>
                <Show when={i() > 0}>
                  <span class="fe-sep">/</span>
                </Show>
                <button
                  class="fe-crumb-btn"
                  onClick={() => navigate(crumb.path)}
                >
                  {crumb.label}
                </button>
              </>
            )}
          </For>
        </div>
      </div>

      {/* Content */}
      <div class="fe-content">
        <Show when={loading()}>
          <div class="fe-loading">Loading…</div>
        </Show>
        <Show when={error()}>
          <div class="fe-error">{error()}</div>
        </Show>
        <Show when={!loading() && !error() && browseResult()}>
          <Show when={browseResult()!.entries.length === 0}>
            <div class="fe-empty">Empty directory</div>
          </Show>
          <For each={browseResult()!.entries}>
            {(entry) => (
              <div
                class={`fe-entry fe-${entry.type}`}
                onClick={() => {
                  if (entry.type === "directory") navigate(entry.path);
                }}
                title={entry.path}
              >
                <span class="fe-icon">
                  {entry.type === "directory" ? "📁" : fileIcon(entry.name)}
                </span>
                <span class="fe-name">{entry.name}</span>
                <Show when={entry.type === "file"}>
                  <span class="fe-size">{formatSize(entry.size)}</span>
                </Show>
              </div>
            )}
          </For>
        </Show>
        <Show when={roots.loading}>
          <div class="fe-loading">Loading roots…</div>
        </Show>
        <Show when={!roots.loading && (!roots() || roots()!.length === 0)}>
          <div class="fe-error">
            No allowed paths configured. Add paths to{" "}
            <code>monitor_allowed_paths</code> in supervisor.toml or register
            workspaces in the MCP server.
          </div>
        </Show>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx", "js", "jsx", "mjs"].includes(ext)) return "📜";
  if (["rs"].includes(ext)) return "🦀";
  if (["json", "toml", "yaml", "yml"].includes(ext)) return "⚙";
  if (["md", "txt", "log"].includes(ext)) return "📄";
  if (["png", "jpg", "jpeg", "svg", "gif", "webp"].includes(ext)) return "🖼";
  if (["zip", "tar", "gz", "7z"].includes(ext)) return "📦";
  return "📄";
}
