---
applyTo: "**/*"
---

# Project Memory Context Files — Workspace Reference

This workspace uses the Project Memory MCP server. All context is stored in SQLite — there are no raw JSON files to edit on disk. All reads and writes go through `memory_context` tool calls.

---

## Storage Architecture

| Scope | DB table | Keyed by | Used for |
|-------|----------|----------|----------|
| Plan context | `context_items` (`parent_type = "plan"`) | `workspace_id` + `plan_id` + `type` | Per-plan findings, architecture, logs |
| Workspace context | `context_items` (`parent_type = "workspace"`) | `workspace_id` | Cross-plan metadata, tech stack, shared decisions |
| Knowledge files | `knowledge` table | `workspace_id` + `slug` | Long-lived named knowledge that survives plan archival |
| Research notes | `context_items` (`parent_type = "plan"`) | `workspace_id` + `plan_id` + filename | Markdown research notes written by Researcher |
| Session logs | `context_items` (special type prefix) | `tool_log_session:{session_id}` | Tool invocation logs — do not write directly |

All materialized `.projectmemory/` files (prompt files, dumps, exports) are derived artifacts only — the database is the source of truth.

---

## Plan-Scoped Context

### Reading

```json
{ "action": "get", "workspace_id": "...", "plan_id": "...", "type": "research_findings" }
```

```json
{ "action": "list", "workspace_id": "...", "plan_id": "..." }
```
Returns `["original_request.json", "research_findings.json", ...]` — the `.json` suffix is cosmetic; the actual key is the type string without the extension.

### Writing

```json
{
  "action": "store",
  "workspace_id": "...",
  "plan_id": "...",
  "type": "architecture",
  "data": { "summary": "...", "decisions": [...] }
}
```

`data` is required and must be an object. Storing to the same `type` again **replaces** the previous value.

### Standard plan context types

| Type | Written by | Contains |
|------|-----------|----------|
| `original_request` | Coordinator (via `store_initial`) | User request, requirements, constraints, files mentioned |
| `research_findings` | Researcher | Evidence, file paths, patterns found, gaps |
| `architecture` | Architect | Design decisions, component boundaries, approach |
| `execution_log` | Executor | Commands run, files changed, build output |
| `review_findings` | Reviewer | Issues found, pass/fail, recommendations |
| `audit` | Any agent | Audit trail entries |

Custom types are allowed — use `snake_case` identifiers.

### `store_initial` shortcut

Used by Coordinator at the start of a new plan. Accepts structured fields directly:

```json
{
  "action": "store_initial",
  "workspace_id": "...",
  "plan_id": "...",
  "user_request": "...",
  "files_mentioned": ["src/foo.ts"],
  "requirements": ["..."],
  "constraints": ["..."]
}
```

### Research notes (markdown, plan-scoped)

```json
{ "action": "append_research", "workspace_id": "...", "plan_id": "...", "filename": "api-analysis.md", "content": "## Finding\n..." }
```

```json
{ "action": "list_research", "workspace_id": "...", "plan_id": "..." }
```

- `filename` must end in `.md`.
- `append_research` appends to the file each call — it does not replace.
- List returns filenames only; read content with `get` using the filename as the type, or via `pull`.

---

## Workspace-Scoped Context

Stores cross-plan metadata: tech stack, architecture principles, shared conventions, workspace description. Survives plan archival and reindexing.

### Reading

```json
{ "action": "workspace_get", "workspace_id": "..." }
```

Returns a `WorkspaceContext` object with a `sections` map.

### Updating (preferred — merge)

```json
{
  "action": "workspace_update",
  "workspace_id": "...",
  "data": {
    "tech_stack": { "summary": "Rust (MCP server), TypeScript (dashboard), SQLite" },
    "conventions": {
      "items": [
        { "title": "All context goes through memory_context, never direct DB writes" },
        { "title": "Plan steps updated live — never batched at end of session" }
      ]
    }
  }
}
```

`workspace_update` merges: only keys present in `data` are touched; existing sections not mentioned are preserved. Within a section, `summary` and `items` replace their respective fields if provided.

### Replacing (destructive — use sparingly)

```json
{ "action": "workspace_set", "workspace_id": "...", "data": { ... } }
```

This replaces the entire workspace context. Only use for migrations or full resets.

### Deleting

```json
{ "action": "workspace_delete", "workspace_id": "..." }
```

### Sections schema

Each key in `data` (or `sections`) is a section name. A section is an object with:

| Field | Type | Description |
|-------|------|-------------|
| `summary` | string (optional) | Free-text description of this section |
| `items` | `{title: string, ...}[]` (optional) | List of discrete entries; each must have `title` |

**Auto-wrapping**: If you pass flat key-value pairs without a `sections` wrapper, the system auto-converts each non-reserved key:
- `string` value → `{ summary: value }`
- `array` value → `{ items: [{title: JSON.stringify(el)}...] }`
- `object` value → `{ summary: JSON.stringify(value) }`

Reserved keys that are NOT auto-wrapped as sections: `schema_version`, `workspace_id`, `workspace_path`, `identity_file_path`, `name`, `sections`, `created_at`, `updated_at`, `update_log`, `audit_log`.

**Size limit**: 1 MB per workspace context document.

---

## Knowledge Files

Knowledge files are named, workspace-scoped documents with a stable slug. Unlike workspace context (one document), you can have many knowledge files. Use knowledge files for:
- Architecture decision records (ADRs)
- Stable reference documentation agents should recall across plans
- Lookup tables, configuration maps, domain glossaries

### Storing / updating

```json
{
  "action": "knowledge_store",
  "workspace_id": "...",
  "slug": "tech-stack-overview",
  "title": "Tech Stack Overview",
  "data": { "layers": [...], "build_commands": {...} },
  "category": "architecture",
  "tags": ["rust", "typescript", "sqlite"],
  "created_by_agent": "Architect",
  "created_by_plan": "plan_abc123_def456"
}
```

`knowledge_store` is an upsert — calling it again with the same `slug` updates the record.

**Slug rules**: URL-safe, lowercase, hyphens only (e.g. `build-system-overview`, `mcp-tool-map`).

### Reading

```json
{ "action": "knowledge_get", "workspace_id": "...", "slug": "tech-stack-overview" }
```

### Listing

```json
{ "action": "knowledge_list", "workspace_id": "..." }
```

```json
{ "action": "knowledge_list", "workspace_id": "...", "category": "architecture" }
```

Returns metadata only (slug, title, category, tags, timestamps) — not the `data` payload.

### Deleting

```json
{ "action": "knowledge_delete", "workspace_id": "...", "slug": "tech-stack-overview" }
```

---

## Choosing the Right Scope

| Information | Scope | Action |
|-------------|-------|--------|
| User request for this plan | Plan | `store_initial` |
| Research findings for this plan | Plan | `store` type `research_findings` |
| Architecture for this plan | Plan | `store` type `architecture` |
| Multi-plan tech stack description | Workspace | `workspace_update` |
| Coding conventions this workspace follows | Workspace | `workspace_update` |
| Long-lived ADR or reference doc | Knowledge | `knowledge_store` |
| Scratch notes during investigation | Plan | `append_research` |

### Workspace context vs knowledge files

Use **workspace context** (`workspace_update`) for short structured metadata (tech stack summary, tags, a few bullet-point conventions). It is a single document.

Use **knowledge files** (`knowledge_store`) when you need multiple named documents, each with substantial `data`, that agents should discover and retrieve by slug. Think of them as a per-workspace wiki.

---

## Bulk Operations

```json
{
  "action": "batch_store",
  "workspace_id": "...",
  "plan_id": "...",
  "items": [
    { "type": "research_findings", "data": { ... } },
    { "type": "architecture", "data": { ... } }
  ]
}
```

Stores multiple plan context entries in one call.

---

## Searching Context

```json
{
  "action": "search",
  "workspace_id": "...",
  "query": "authentication middleware"
}
```

Searches across plan context, workspace context, research notes, and knowledge files for the workspace. Useful for agents discovering what's already been recorded.

---

## Context Dumps

To export a full snapshot of a plan's context for debugging or handoff:

```json
{ "action": "dump_context", "workspace_id": "...", "plan_id": "..." }
```

Writes to `.projectmemory/data/{workspace_id}/plans/{plan_id}/dumps/{timestamp}-context-dump.json` and returns a summary of what sections were included.

---

## Who Reads / Writes What

| Agent | Reads | Writes |
|-------|-------|--------|
| Hub (Coordinator) | `workspace_get`, current plan state | `store_initial`, `workspace_update` |
| PromptAnalyst | `workspace_get` | nothing |
| Researcher | `original_request` | `research_findings`, `append_research` |
| Architect | `original_request`, `research_findings`, `workspace_get` | `architecture` |
| Executor | `architecture`, `workspace_get` | `execution_log` |
| Reviewer | `architecture`, `execution_log` | `review_findings` |
| Revisionist | `review_findings`, `execution_log` | revised architecture or step notes |
| Archivist | all plan context | `knowledge_store` (may promote findings to knowledge) |
