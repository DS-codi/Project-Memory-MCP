---
applyTo: "**/*"
---

# memory_filesystem — Tool Reference

Workspace-scoped filesystem operations with built-in safety boundaries. All paths are resolved relative to the registered workspace root.

## Safety model

| Boundary | Enforcement |
|----------|-------------|
| Path traversal | `../` and absolute paths outside workspace root are rejected |
| Sensitive files | `.env`, private keys, credentials files are inaccessible |
| Destructive ops | `delete` requires `confirm: true`; both `delete` and `move` support `dry_run` previews |
| Symlinks | Allowed only when every resolved target stays inside workspace root |
| Read cap | Files truncated at 1 MB to prevent context overflow |
| Write/append limits | Payload size limits enforced |
| Search/list/tree limits | Result count limits enforced; truncation reported in response metadata |

**Tool selection rule:** Use `memory_filesystem` for deterministic workspace file CRUD/search/tree. Use `memory_terminal` for command execution (build/test/lint). Do not emulate file operations through shell commands.

---

## Actions

### `read`

Read a file's content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"read"` |
| `workspace_id` | string | ✅ | Workspace ID |
| `path` | string | ✅ | File path relative to workspace root |

**Returns:** `{ content, size_bytes, truncated }` — `truncated: true` if file exceeded 1 MB cap.

**Example:**
```json
{
  "action": "read",
  "workspace_id": "my-project-652c624f8f59",
  "path": "src/index.ts"
}
```

---

### `write`

Write or create a file. Overwrites if file exists.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"write"` |
| `workspace_id` | string | ✅ | Workspace ID |
| `path` | string | ✅ | File path relative to workspace root |
| `content` | string | ✅ | File content |
| `create_dirs` | boolean | — | Auto-create parent directories (default: true) |

**Example:**
```json
{
  "action": "write",
  "workspace_id": "my-project-652c624f8f59",
  "path": "src/new-module.ts",
  "content": "export function foo() { ... }",
  "create_dirs": true
}
```

---

### `append`

Append content to an existing file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"append"` |
| `workspace_id` | string | ✅ | Workspace ID |
| `path` | string | ✅ | File path relative to workspace root |
| `content` | string | ✅ | Content to append |

---

### `exists`

Check whether a path exists and what type it is.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"exists"` |
| `workspace_id` | string | ✅ | Workspace ID |
| `path` | string | ✅ | Path to check |

**Returns:** `{ exists, type }` — type is `"file"`, `"directory"`, or `null`.

---

### `list`

List directory contents.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list"` |
| `workspace_id` | string | ✅ | Workspace ID |
| `path` | string | — | Directory path (default: workspace root) |
| `recursive` | boolean | — | Recurse into subdirectories |

**Returns:** Array of `{ name, type, size_bytes, modified_at }`.

---

### `tree`

Recursive directory tree with depth control.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"tree"` |
| `workspace_id` | string | ✅ | Workspace ID |
| `path` | string | — | Root directory (default: workspace root) |
| `max_depth` | number | — | Max depth (default: 3, max: 10) |

**Returns:** Nested tree structure. Result count limits apply; truncation noted in response.

**Example:**
```json
{
  "action": "tree",
  "workspace_id": "my-project-652c624f8f59",
  "path": "src",
  "max_depth": 3
}
```

---

### `search`

Find files by glob pattern or regex.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"search"` |
| `workspace_id` | string | ✅ | Workspace ID |
| `pattern` | string | — | Glob pattern (e.g. `"**/*.test.ts"`) |
| `regex` | string | — | Regex pattern (alternative to glob) |
| `include` | string | — | File include filter (e.g. `"*.ts"`) |

**Example:**
```json
{
  "action": "search",
  "workspace_id": "my-project-652c624f8f59",
  "pattern": "**/*.test.ts"
}
```

---

### `discover_codebase`

Derive keywords from a prompt/task description and return ranked related file paths. Useful for narrowing scope before deciding which files to read.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"discover_codebase"` |
| `workspace_id` | string | ✅ | Workspace ID |
| `prompt_text` | string | ✅ | Prompt text used to derive discovery keywords |
| `task_text` | string | — | Optional task text appended to prompt_text before keyword derivation |
| `limit` | number | — | Max ranked results (default: 20, max: 100) |

**Returns:** Ranked array of file paths relevant to the prompt.

**When to use:** At the start of an implementation step when you need to quickly identify which files are relevant without manually searching.

---

### `delete`

Delete a file or empty directory. Requires explicit confirmation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"delete"` |
| `workspace_id` | string | ✅ | Workspace ID |
| `path` | string | ✅ | Path to delete |
| `confirm` | boolean | ✅ | Must be `true` — hard required for destructive ops |
| `dry_run` | boolean | — | Preview without deleting (default: false) |

**Rule:** Always call with `dry_run: true` first when impact is uncertain, then confirm with `confirm: true`.

**Example:**
```json
{
  "action": "delete",
  "workspace_id": "my-project-652c624f8f59",
  "path": "src/old-module.ts",
  "confirm": true
}
```

---

### `move`

Move or rename a path.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"move"` |
| `workspace_id` | string | ✅ | Workspace ID |
| `source` | string | ✅ | Source path |
| `destination` | string | ✅ | Destination path |
| `overwrite` | boolean | — | Overwrite destination if it exists (default: false) |
| `dry_run` | boolean | — | Preview without moving |

---

### `copy`

Copy a file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"copy"` |
| `workspace_id` | string | ✅ | Workspace ID |
| `source` | string | ✅ | Source file path |
| `destination` | string | ✅ | Destination path |
| `overwrite` | boolean | — | Overwrite destination if it exists (default: false) |

---

## Destructive operation policy

1. Use `confirm: true` for `delete` — missing confirm is a hard error.
2. Prefer `dry_run: true` first for `delete`/`move` when impact is uncertain.
3. Structured audit metadata is returned for all destructive outcomes.
4. Symlink escapes and broken-link unsafe paths are denied.
