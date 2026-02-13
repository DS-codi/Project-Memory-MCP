/**
 * Workspace Mounts - Container ↔ Host path translation
 * 
 * When running inside a container, host workspace directories are mounted
 * at /workspaces/<workspace-id>. The MBS_WORKSPACE_MOUNTS env var provides
 * the translation table as a JSON map: { "c:/users/user/project": "/workspaces/project-abc123" }
 * 
 * This module resolves paths in both directions so the server can:
 * - Access workspace identity files via their container-mapped path
 * - Translate container paths back to host paths for storage metadata
 */

import { promises as fs } from 'fs';
import path from 'path';

const WINDOWS_ABSOLUTE_PATH_RE = /^[a-zA-Z]:[\\\/]/;

interface MountMapping {
  hostPath: string;       // Original Windows path (normalised, lowercase, forward-slash)
  containerPath: string;  // Mount point inside container, e.g. /workspaces/project-abc123
}

let cachedMounts: MountMapping[] | null = null;

/**
 * Parse the MBS_WORKSPACE_MOUNTS env var.
 * Format: JSON object { "c:/users/user/project": "/workspaces/project-abc123" }
 */
function loadMounts(): MountMapping[] {
  if (cachedMounts !== null) return cachedMounts;

  const raw = process.env.MBS_WORKSPACE_MOUNTS;
  if (!raw) {
    cachedMounts = [];
    return cachedMounts;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    cachedMounts = Object.entries(parsed).map(([hostPath, containerPath]) => ({
      hostPath: normalizePath(hostPath),
      containerPath,
    }));
  } catch (err) {
    console.warn('Failed to parse MBS_WORKSPACE_MOUNTS:', err);
    cachedMounts = [];
  }

  return cachedMounts;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase().replace(/\/+$/, '');
}

/**
 * Check whether we're running inside a container (Linux process with 
 * workspace mounts configured or non-windows platform).
 */
export function isContainerEnvironment(): boolean {
  return process.platform !== 'win32';
}

/**
 * Resolve a host workspace path to its container mount path.
 * Returns null if the path has no known mount.
 * 
 * Example: "C:\\Users\\User\\SomeProject" → "/workspaces/someproject-abc123"
 */
export function resolveToContainerPath(hostPath: string): string | null {
  if (!isContainerEnvironment()) return null;
  if (!WINDOWS_ABSOLUTE_PATH_RE.test(hostPath)) return null;

  const mounts = loadMounts();
  const normalizedHost = normalizePath(hostPath);

  for (const mount of mounts) {
    if (normalizedHost === mount.hostPath) {
      return mount.containerPath;
    }
    // Also check if hostPath is a subpath of the mount
    if (normalizedHost.startsWith(mount.hostPath + '/')) {
      const relative = normalizedHost.slice(mount.hostPath.length);
      return mount.containerPath + relative;
    }
  }

  return null;
}

/**
 * Resolve a container mount path back to the original host path.
 * Returns null if the path doesn't match any mount.
 * 
 * Example: "/workspaces/someproject-abc123" → "c:/users/user/someproject"
 */
export function resolveToHostPath(containerPath: string): string | null {
  const mounts = loadMounts();
  const normalizedContainer = normalizePath(containerPath);

  for (const mount of mounts) {
    if (normalizedContainer === normalizePath(mount.containerPath)) {
      return mount.hostPath;
    }
    const mountNormalized = normalizePath(mount.containerPath);
    if (normalizedContainer.startsWith(mountNormalized + '/')) {
      const relative = normalizedContainer.slice(mountNormalized.length);
      return mount.hostPath + relative;
    }
  }

  return null;
}

/**
 * Test whether a workspace path is accessible — either directly (local/native)
 * or via a container mount.
 * 
 * Returns the accessible path (which may be the original or the container-mapped one),
 * or null if the path is not reachable.
 */
export async function resolveAccessiblePath(workspacePath: string): Promise<string | null> {
  // Direct access check (works on native Windows or if already a container path)
  try {
    const stat = await fs.stat(workspacePath);
    if (stat.isDirectory()) return workspacePath;
  } catch {
    // Not directly accessible — try container mount
  }

  // If it's a Windows path on a Linux container, try resolving via mounts
  if (isContainerEnvironment() && WINDOWS_ABSOLUTE_PATH_RE.test(workspacePath)) {
    const containerPath = resolveToContainerPath(workspacePath);
    if (containerPath) {
      try {
        const stat = await fs.stat(containerPath);
        if (stat.isDirectory()) return containerPath;
      } catch {
        // Mount exists in config but directory not accessible
      }
    }
  }

  return null;
}

/**
 * Get all configured workspace mount mappings.
 */
export function getWorkspaceMounts(): MountMapping[] {
  return loadMounts();
}

/**
 * Clear the cached mounts (for testing or after env changes).
 */
export function clearMountCache(): void {
  cachedMounts = null;
}
