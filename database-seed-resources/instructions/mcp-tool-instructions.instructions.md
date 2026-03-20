---
applyTo: "**/*"
---

# memory_instructions — Tool Reference

Dedicated read/search tool for instruction files stored in the DB. Prefer this over `memory_agent`'s `list_instructions`/`get_instruction` actions for any read-only use — it fetches only what you need and has no agent-lifecycle overhead.

## Token efficiency rule

`search` and `get_section` are almost always better than `get`. A 4,000-token instruction file costs nothing if you pull only the 200-token section you need.

---

## Actions

### `list`

Return all instruction filenames and metadata. No content returned.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list"` |

**Returns:** `[{ filename, applies_to, updated_at }]`

**When to use:** Discover what instruction files exist before deciding what to fetch.

**Example:**
```json
{ "action": "list" }
```

---

### `list_workspace`

Return instructions assigned to a specific workspace. No content returned.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list_workspace"` |
| `workspace_id` | string | ✅ | Workspace ID |

**Returns:** `[{ filename, applies_to, assignment_notes, updated_at }]`

**When to use:** At session init — find which instructions are relevant to your workspace before deciding what to load.

**Example:**
```json
{
  "action": "list_workspace",
  "workspace_id": "my-project-652c624f8f59"
}
```

---

### `search`

LIKE keyword search across all instruction filenames and content. Returns section excerpts, never full file content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"search"` |
| `query` | string | ✅ | Keyword or phrase to search for |

**Returns:** `[{ filename, applies_to, section_matches: [{ heading, excerpt }] }]`

`section_matches` contains `##`/`###` sections whose heading or body contained the query, with a ~300-char excerpt centred on the first match. Files with no `##`/`###` headings still appear in results if the content matched, with `section_matches: []`.

**When to use:** When you know what topic you need but not which file or section contains it.

**Example:**
```json
{
  "action": "search",
  "query": "handoff"
}
```

---

### `get`

Load the full content of one instruction file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get"` |
| `filename` | string | ✅ | Exact instruction filename |

**Returns:** `{ filename, applies_to, content, updated_at }`

**When to use:** Only when you need the entire file. For large files (> ~1,500 tokens), prefer `get_section` instead.

**Example:**
```json
{
  "action": "get",
  "filename": "mcp-tool-plan.instructions.md"
}
```

---

### `get_section`

Extract a single `##` or `###` section from an instruction file by heading.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get_section"` |
| `filename` | string | ✅ | Exact instruction filename |
| `heading` | string | ✅ | Partial, case-insensitive heading match |

**Returns:** `{ filename, heading, content }` — the matched heading line plus all body lines until the next same-or-higher-level heading.

**Returns error** (`success: false`) if the file is not found or no heading matches.

**Multiple matches:** Returns the first matching section. Use a more specific heading substring if you need a different section.

**When to use:** Pulling one action's documentation from a large reference file. This is the primary token-saving pattern — a section is typically 150–400 tokens versus 3,000–5,000 for the full file.

**Example — pull just the `create` action docs from the plan reference:**
```json
{
  "action": "get_section",
  "filename": "mcp-tool-plan.instructions.md",
  "heading": "create"
}
```

**Example — pull the handoff return protocol:**
```json
{
  "action": "get_section",
  "filename": "handoff-protocol.instructions.md",
  "heading": "return"
}
```

---

## Recommended discovery workflow

1. `list_workspace` — see which files are assigned to your workspace
2. `search` with your topic keyword — find relevant files and sections without loading anything
3. `get_section` for the specific heading you need
4. `get` only if you truly need the whole file

## Error cases

| Error | Cause |
|-------|-------|
| `"query is required for search"` | Called search without query |
| `"filename is required for get"` | Called get/get_section without filename |
| `"heading is required for get_section"` | Called get_section without heading |
| `"Instruction file not found: X"` | Filename doesn't exist in DB |
| `"Section \"X\" not found in Y"` | File exists but no heading matched |
