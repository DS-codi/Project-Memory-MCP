# DbRef Mixed-Environment Guide

> Operational guide for consumers that must handle responses containing both legacy path strings and typed `DbRef` / `FileRef` references during the migration period.

## Detecting DbRef in a response

Every augmented response includes a `_ref` field when a typed reference is available. Check for `_ref` with a `ref_type` property — this is the **schema-driven** detection method (never parse path strings to guess whether something is DB-backed):

```typescript
function hasTypedRef(response: Record<string, unknown>): boolean {
  return (
    response._ref != null &&
    typeof response._ref === 'object' &&
    'ref_type' in (response._ref as object)
  );
}
```

---

## Consumer handling pattern

### General pattern (TypeScript)

```typescript
import type { ArtifactRef } from '../types/db-ref.types.js';

function resolveArtifact(response: { _ref?: ArtifactRef; path?: string }) {
  if (response._ref?.ref_type === 'db') {
    // DB-backed artifact — use table + row_id for lookup
    const { table, row_id, database, display_name } = response._ref;
    // Pass to storage layer: storageGet(table, row_id)
    return { source: 'db', table, row_id, display_name };
  }

  if (response._ref?.ref_type === 'file') {
    // Real filesystem artifact — use path directly
    const { path, display_name } = response._ref;
    return { source: 'file', path, display_name };
  }

  // Legacy response — no _ref present; fall back to existing path extraction
  if (response.path) {
    return { source: 'legacy', path: response.path, display_name: response.path };
  }

  throw new Error('Response contains no artifact reference');
}
```

### Decision flow

```
Has _ref?
├── Yes → check _ref.ref_type
│   ├── 'db'   → use _ref.table + _ref.row_id via storage layer
│   └── 'file' → use _ref.path for direct filesystem access
└── No → legacy response — fall back to existing path field
```

---

## Consumer-specific guidance

### Agents (MCP tool consumers)

Agents receive tool responses via the MCP protocol. During the transition:

1. **Always** check for `_ref` before reading the `path` field.
2. If `_ref.ref_type === 'db'`, do **not** attempt filesystem operations on the `path` field — it is a synthetic compatibility path that does not exist on disk.
3. Use `display_name` for logging and user-facing output.
4. If `_ref` is missing, the response is from a pre-DbRef server or an unaugmented code path — use `path` as before.

### Dashboard frontend

The dashboard receives artifact data through its API routes:

1. **Rendering:** Show `_ref.display_name` as the primary label. Use `_ref.ref_type` to select an appropriate icon (database icon for `'db'`, file icon for `'file'`).
2. **Navigation:** For `'db'` refs, construct internal dashboard routes using `table` + `row_id`. For `'file'` refs, link to the filesystem path.
3. **Fallback:** If `_ref` is absent, render the `path` field as before.

### agentScanner

The `agentScanner` (`dashboard/server/src/services/agentScanner.ts`) crawls the data directory to build agent/plan inventories:

1. When encountering data objects with `_ref`, use `ref_type` to determine the resolution strategy.
2. For `ref_type === 'db'`: skip filesystem stat/read — the artifact lives in SQLite. Use the storage layer to retrieve content.
3. For `ref_type === 'file'`: proceed with normal filesystem operations.
4. For objects without `_ref`: continue with the existing filesystem-based resolution (legacy behavior).

### VS Code extension

The extension interacts via MCP tool invocations:

1. Prefer `_ref` when available for constructing tree-view items, quickpick entries, etc.
2. Use `display_name` from `_ref` instead of extracting names from path strings.
3. When building links to artifacts, use `ref_type` to distinguish whether to open a file editor or navigate to a dashboard route.

---

## Error handling

| Scenario | Action |
|----------|--------|
| `_ref` is missing | Legacy fallback — use `path` field as before. No error. |
| `_ref` is present but malformed (missing `ref_type`, invalid `table`) | Log a warning, ignore the `_ref`, fall back to `path`. Do not crash. |
| `_ref.ref_type` is an unrecognised value (future extension) | Log a warning, fall back to `path`. Forward-compatible consumers can treat unknown types as opaque references. |
| `_ref.ref_type === 'db'` but storage lookup fails | Surface the error normally (the artifact may have been deleted). Do not attempt filesystem fallback — the path is synthetic. |
| `_ref.ref_type === 'file'` but file is missing | Handle as a normal missing-file error — the path was expected to exist. |

### Validation helper

For consumers that want to validate `_ref` at runtime:

```typescript
import { ArtifactRefSchema } from '../types/db-ref.types.js';

function validateRef(ref: unknown): boolean {
  const result = ArtifactRefSchema.safeParse(ref);
  if (!result.success) {
    console.warn('Malformed _ref — falling back to path:', result.error.message);
    return false;
  }
  return true;
}
```

---

## Compatibility matrix

| Consumer | Stage 1 (current) | Stage 2 (feature-flagged) | Stage 3 (v2.0 final) |
|----------|-------------------|---------------------------|----------------------|
| **Agents (MCP tools)** | Use `path`, `_ref` available but optional | Should read `_ref`; `path` present in compat mode | Must use `_ref` exclusively |
| **Dashboard frontend** | Uses `path` for all rendering | Should use `_ref` for labels & navigation | Must use `_ref` exclusively |
| **agentScanner** | Filesystem-only resolution | DbRef-aware; skips filesystem for `'db'` refs | DbRef-only; no filesystem fallback for DB artifacts |
| **VS Code extension** | Uses `path` for tree items / quickpicks | Should use `_ref` for display and navigation | Must use `_ref` exclusively |
| **External integrations** | Path strings in API responses | Both `_ref` and path (compat mode) | Only `_ref`; path fields removed |

### Feature flag interaction

| `PM_DBREF_MODE` | `_ref` field | Legacy `path` field | Recommended for |
|-----------------|-------------|---------------------|-----------------|
| `compat` (default) | ✅ Present | ✅ Present | Stage 1 & 2 — all environments |
| `strict` | ✅ Present | ❌ Omitted | Stage 2 testing & Stage 3 |

---

## Migration checklist for new consumers

When writing new code that consumes artifact responses:

- [ ] Always destructure `_ref` from the response
- [ ] Check `_ref.ref_type` to determine resolution strategy
- [ ] Never construct filesystem paths from `table` + `row_id` — use the storage layer
- [ ] Never parse path strings to detect whether an artifact is DB-backed
- [ ] Use `display_name` for user-facing output
- [ ] Handle missing `_ref` gracefully (legacy fallback)
- [ ] Validate with `ArtifactRefSchema` at trust boundaries (external input)

---

## Related files

| File | Purpose |
|------|---------|
| `server/src/types/db-ref.types.ts` | Type definitions, guards, schemas, factories |
| `server/src/utils/ref-compat.ts` | Compatibility bridge (deprecated — removed in v2.0) |
| `server/src/config/dbref-config.ts` | Feature flag (`PM_DBREF_MODE`) |
| `docs/dbref-rollout-plan.md` | 3-stage rollout timeline |
