/**
 * Simple TTL cache to prevent repeated filesystem scans.
 * 
 * The dashboard server was doing full O(workspaces × plans) filesystem
 * reads on every /api/metrics, /api/workspaces, /api/search call.
 * With 20+ workspaces this means hundreds of file reads per request,
 * multiple times per minute.
 * 
 * This cache stores computed results with a TTL and is invalidated
 * by the file watcher when state.json / workspace.meta.json changes.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class TTLCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private defaultTTL: number;

  constructor(defaultTTLMs = 30_000) {
    this.defaultTTL = defaultTTLMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    });
  }

  /** Invalidate a specific key */
  delete(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all keys matching a prefix */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /** Invalidate everything */
  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/**
 * Singleton cache instance.
 * 
 * Key conventions:
 *   "workspaces"              — scanWorkspaces() result
 *   "plans:{workspaceId}"     — getWorkspacePlans() result  
 *   "planState:{wsId}:{planId}" — getPlanState() result
 *   "metrics"                 — full /api/metrics response
 *   "metrics:agents"          — /api/metrics/agents response
 */
export const dataCache = new TTLCache(30_000); // 30s default TTL
