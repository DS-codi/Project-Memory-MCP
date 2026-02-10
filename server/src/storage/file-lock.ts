/**
 * File Lock Manager - Cross-process file locking for concurrent access
 * 
 * Extracted from file-store.ts to allow both file-store.ts and
 * workspace-identity.ts to use locking without circular dependencies.
 * 
 * Provides file-level (not directory-level) locking via proper-lockfile,
 * plus in-memory locks for same-process serialization.
 */

import { promises as fs } from 'fs';
import path from 'path';
import lockfile from 'proper-lockfile';

// =============================================================================
// File Lock Manager
// =============================================================================

/**
 * Cross-process file lock manager using proper-lockfile.
 * Provides both in-memory locks (for same-process serialization) and
 * filesystem locks (for cross-process serialization).
 * 
 * Locks at the FILE level (not directory level) to avoid contention
 * between operations on different files in the same workspace.
 */
class FileLockManager {
  private inMemoryLocks: Map<string, Promise<void>> = new Map();

  /**
   * Execute an operation with exclusive access to a specific file.
   * Uses both in-memory locks (same process) and filesystem locks (cross-process).
   */
  async withLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const normalizedPath = path.normalize(filePath).toLowerCase();

    // First, serialize within this process
    const existingLock = this.inMemoryLocks.get(normalizedPath);
    if (existingLock) {
      await existingLock.catch(() => {});
    }

    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.inMemoryLocks.set(normalizedPath, lockPromise);

    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Ensure the file exists so proper-lockfile can lock it.
      // If the file doesn't exist yet, create it with "null" content.
      // The operation callback (e.g. modifyJsonLocked) handles reading
      // null and creating the initial value.
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, 'null', 'utf-8');
      }

      // Lock the specific file (not the directory).
      // proper-lockfile creates a <filePath>.lock directory as the lock indicator.
      const lockOptions = {
        stale: 10000,     // Consider lock stale after 10s
        realpath: false,  // Don't resolve symlinks (avoids issues with non-canonical paths)
        retries: {
          retries: 10,
          minTimeout: 100,
          maxTimeout: 1000,
          factor: 2,
        },
      };

      let release: (() => Promise<void>) | null = null;
      try {
        release = await lockfile.lock(filePath, lockOptions);
        return await operation();
      } finally {
        if (release) {
          try {
            await release();
          } catch {
            // Ignore unlock errors (lock may have been stale)
          }
        }
      }
    } finally {
      resolveLock!();
      if (this.inMemoryLocks.get(normalizedPath) === lockPromise) {
        this.inMemoryLocks.delete(normalizedPath);
      }
    }
  }
}

/** Singleton lock manager instance */
export const fileLockManager = new FileLockManager();

// =============================================================================
// Locked JSON helpers
// =============================================================================

/**
 * Read a JSON file (unlocked — use modifyJsonLocked for concurrent access).
 */
export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Write a JSON file with pretty formatting (unlocked).
 * Prefer writeJsonLocked() or modifyJsonLocked() for concurrent access.
 */
export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Read-modify-write a JSON file with file-level locking.
 * The modifier receives the current value (or null if the file doesn't exist)
 * and returns the new value to write.
 */
export async function modifyJsonLocked<T>(
  filePath: string,
  modifier: (data: T | null) => Promise<T> | T
): Promise<T> {
  return fileLockManager.withLock(filePath, async () => {
    const data = await readJson<T>(filePath);
    const modified = await modifier(data);
    await writeJson(filePath, modified);
    return modified;
  });
}

/**
 * Write a JSON file with file-level locking.
 * Use this for simple writes that don't need to read first.
 * For read-modify-write, use modifyJsonLocked() instead.
 */
export async function writeJsonLocked<T>(filePath: string, data: T): Promise<void> {
  await fileLockManager.withLock(filePath, async () => {
    await writeJson(filePath, data);
  });
}
