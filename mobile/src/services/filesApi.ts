import { getApiKey, getServerConfig } from "./storage";

async function guiFetch<T>(path: string): Promise<T> {
  const isBrowser = !(window as any).Capacitor?.isNativePlatform?.();
  let base = "";
  const headers: Record<string, string> = {};

  if (!isBrowser) {
    const cfg = await getServerConfig();
    if (!cfg) throw new Error("No server config");
    // GUI server port is always guiPort; default 3464 is not stored in config,
    // but the monitor runs in browser mode where the Vite proxy handles /gui.
    base = `http://${cfg.host}:3464`;
  }

  const key = await getApiKey();
  if (key) headers["X-PM-API-Key"] = key;

  const res = await fetch(`${base}${path}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface FileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  path: string;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: FileEntry[];
}

/** Returns the list of root paths the file browser is permitted to show. */
export async function getFileRoots(): Promise<string[]> {
  const result = await guiFetch<{ roots: string[] }>("/gui/files/roots");
  return result.roots;
}

/** Lists the contents of `dirPath`. Throws if the path is not allowed. */
export async function browseDirectory(dirPath: string): Promise<BrowseResult> {
  return guiFetch<BrowseResult>(
    `/gui/files/browse?path=${encodeURIComponent(dirPath)}`
  );
}
