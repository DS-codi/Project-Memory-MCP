# DbRef Rollout Plan

> Tracks the 3-stage migration from legacy synthetic filesystem paths to typed `DbRef` / `FileRef` artifact references.

## Background

Prior to this work, all artifact locators (plans, contexts, handoffs, knowledge, workspaces, sessions) were expressed as filesystem path strings — even for artifacts stored in SQLite. This caused:

- Fake-path leakage into agent logs and dashboard surfaces
- Brittle string-based path parsing across consumers
- Ambiguity between DB-backed and real filesystem artifacts

The `DbRef` / `FileRef` discriminated union (defined in `server/src/types/db-ref.types.ts`) replaces these with typed, schema-driven references.

---

## Stage 1 — Additive `_ref` Field (CURRENT — completed in Phases 8–11)

**Status:** ✅ Complete

### What changed

| Area | Change |
|------|--------|
| **Types** | `DbRef`, `FileRef`, `ArtifactRef` union defined in `server/src/types/db-ref.types.ts` |
| **Factory helpers** | `makeDbRef()`, `makeFileRef()` for constructing refs |
| **Serialization** | `toMcpRef()` and `toDisplayString()` for wire/log output |
| **Zod schemas** | `DbRefSchema`, `FileRefSchema`, `ArtifactRefSchema` for runtime validation |
| **Compat adapter** | `toDeprecatedPath()` and `withRefCompat()` in `server/src/utils/ref-compat.ts` |
| **Augmentation sites** | `_ref` attached in `db-store.ts`, `context.tools.ts`, `plan-lifecycle.ts` |

### Invariants

- `_ref` is an **additive** field — all existing path fields remain untouched.
- No consumer is required to read `_ref` yet.
- `toDeprecatedPath()` can reconstruct the legacy path string from a `DbRef` for any consumer that still needs it.
- All existing code continues working unchanged — zero breaking changes.

### Files modified

- `server/src/types/db-ref.types.ts` — type definitions, guards, serialization, Zod schemas, factories
- `server/src/utils/ref-compat.ts` — compatibility bridge (`toDeprecatedPath`, `withRefCompat`)
- `server/src/storage/db-store.ts` — `_ref` augmentation on plan, program, workspace, build-script, and context returns
- `server/src/tools/context.tools.ts` — `_ref` augmentation on context store/get responses
- `server/src/tools/plan/plan-lifecycle.ts` — `_ref` augmentation on plan create/get responses
- `server/src/tools/consolidated/memory_context.ts` — type annotations for `_ref` in consolidated tool surface

---

## Stage 2 — Consumer Migration (NEXT — future work)

**Status:** 🔲 Not started

### Goals

1. New code **must** read `_ref` instead of constructing paths from string fields.
2. Introduce a transitional union type for consumers that handle both formats:
   ```typescript
   type ArtifactLocator = ArtifactRef | string;
   ```
3. Feature flag `PM_DBREF_MODE` controls response behavior:
   - `compat` (default): Both `_ref` and legacy path fields present in responses.
   - `strict`: Only `_ref` present; legacy path fields omitted from responses.

### Feature flag

Defined in `server/src/config/dbref-config.ts`:

```typescript
export type DbRefMode = 'compat' | 'strict';
export function getDbRefMode(): DbRefMode;
export function isDbRefStrictMode(): boolean;
```

Set via environment variable:
```bash
PM_DBREF_MODE=compat   # default — both _ref and paths
PM_DBREF_MODE=strict   # only _ref, no legacy paths
```

### Migration tasks (not yet planned)

- Wire `isDbRefStrictMode()` into response builders so `strict` mode omits `path` fields
- Update `withRefCompat()` to check the flag and skip path injection in strict mode
- Migrate dashboard API routes to read `_ref` from API responses
- Migrate `agentScanner` to use `_ref` for DB-backed artifact resolution
- Update VS Code extension to prefer `_ref` over path fields
- Update all agent tool consumers to destructure `_ref`

---

## Stage 3 — Legacy Path Removal (FINAL — v2.0)

**Status:** 🔲 Not started

### Goals

1. Remove all legacy path fields from every response surface.
2. Remove the compatibility adapter entirely.
3. Remove the transitional `ArtifactLocator` union — only `ArtifactRef` remains.

### Removals

| Item | Location |
|------|----------|
| `toDeprecatedPath()` | `server/src/utils/ref-compat.ts` |
| `withRefCompat()` | `server/src/utils/ref-compat.ts` |
| Entire `ref-compat.ts` module | `server/src/utils/` |
| `ArtifactLocator` union type | wherever defined in Stage 2 |
| `path` fields from response types | all tool response interfaces |
| `PM_DBREF_MODE` feature flag | `server/src/config/dbref-config.ts` |
| `TABLE_PATH_SEGMENTS` mapping | `server/src/utils/ref-compat.ts` |

### Exit criteria

- Zero occurrences of `toDeprecatedPath` or `withRefCompat` in the codebase
- All consumers use `_ref.ref_type` to discriminate artifact location
- `PM_DBREF_MODE` env var removed; `strict` behavior is the only behavior
- No synthetic filesystem paths appear in any MCP tool response or dashboard API response

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Consumer breaks during Stage 2 | Feature flag defaults to `compat`; ship strict as opt-in first |
| Dashboard out of sync with server | Dashboard and server share `db-ref.types.ts` (already duplicated to `dashboard/server/src/types/`) |
| Agent tools produce malformed `_ref` | Zod runtime validation (`ArtifactRefSchema.parse()`) at injection sites |
| Third-party integrations depend on paths | Document migration timeline in release notes; provide `toDeprecatedPath()` until v2.0 |
