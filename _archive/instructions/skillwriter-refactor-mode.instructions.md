---
applyTo: "agents/skill-writer.agent.md"
---

# SkillWriter Refactor Mode — Full Specification

> This instruction file defines SkillWriter's **refactor mode**: scanning a workspace's instruction files and classifying each as keep, convert, split, consolidate/delete, or protected.

---

## 1. Classification Decision Tree

Evaluate each instruction file top-to-bottom. Stop at the **first matching** classification.

### 1a. Protected (never touch)

| Signal | Example |
|--------|---------|
| File is an agent definition (`*.agent.md`) | `coordinator.agent.md` |
| File contains security boundaries or immutable rules | `not-for-you.instructions.md` |
| File is a core system protocol (handoff, MCP tool reference) | `handoff-protocol.instructions.md` |
| Filename matches `*-system.*`, `*-security.*`, `*-protocol.*` | — |

**Action:** Skip entirely. Do not include in report as actionable.

### 1b. Convert to Skill

| Signal | Example |
|--------|---------|
| Content teaches framework/library patterns (React, PySide6, CxxQt) | PySide6 bridge patterns |
| Content describes language idioms or architecture patterns (MVC, MVVM) | Component hierarchy guide |
| Content documents external API usage or integration patterns | REST API conventions |
| Content is reusable across workspaces (not PM-specific) | Build system knowledge |
| Content has code examples as primary payload | Testing pattern templates |
| No hard behavioral rules — purely educational/reference material | — |

**Action:** Generate a new `SKILL.md` and delete the original instruction file (after approval).

### 1c. Split (instruction + skill)

| Signal | Example |
|--------|---------|
| File contains **both** hard operational rules **and** reusable domain knowledge | A file with "agents MUST do X" rules alongside React component patterns |
| Removing the domain knowledge would leave a coherent, smaller instruction file | Build instructions mixed with framework setup guides |
| The domain knowledge portion meets ≥2 "convert to skill" signals above | — |

**Action:** Produce two outputs: (1) a trimmed instruction file retaining only the hard rules, and (2) a new `SKILL.md` containing the extracted domain knowledge. Delete the original.

### 1d. Consolidate or Delete

| Signal | Example |
|--------|---------|
| Content is fully duplicated by another instruction file | Two files covering the same MCP tool |
| Content is outdated or references deprecated features/APIs | References to removed tool names |
| Content is empty, placeholder, or contains only boilerplate | Stub files with no actionable content |
| Content is superseded by a newer, more complete file | Old version kept alongside new |

**Action:** Delete the file (or merge unique content into the surviving file) after approval.

### 1e. Keep as Instruction (conservative default)

If none of the above classifications match, **keep the file as-is**. This is the conservative default — it is always safer to keep than to incorrectly convert or delete.

| Signal | Example |
|--------|---------|
| Content defines MCP tool usage rules | `mcp-tool-plan.instructions.md` |
| Content specifies agent behavioral requirements | `coordinator-operations.instructions.md` |
| Content contains workflow protocols with `MUST`/`MUST NOT` language | `handoff-protocol.instructions.md` |
| Content is PM-internal operational logic | Categorization rules, analysis methodology |
| Classification is ambiguous or uncertain | — |

**Action:** No change. File remains in place.

---

## 2. Classification Report Format

After scanning all files, produce a **Classification Report** as a markdown table. This report is the deliverable of Phase A.

### Report Columns

| Column | Description |
|--------|-------------|
| **File** | Relative path from workspace root |
| **Classification** | One of: `keep`, `convert`, `split`, `consolidate`, `delete`, `protected` |
| **Reasoning** | One-sentence justification citing the matching signal |
| **Proposed Action** | What will happen if approved |
| **Output Path** | Target path for new/moved files (or `—` if no output) |

### Example Report

```markdown
## Classification Report — Project FooBar

| # | File | Classification | Reasoning | Proposed Action | Output Path |
|---|------|---------------|-----------|-----------------|-------------|
| 1 | `.github/instructions/react-patterns.instructions.md` | convert | Teaches React component patterns; reusable across workspaces | Convert to SKILL.md, delete original | `.github/skills/react-patterns/SKILL.md` |
| 2 | `.github/instructions/ci-pipeline.instructions.md` | keep | Defines CI/CD hard rules with MUST/MUST NOT language | No change | — |
| 3 | `.github/instructions/build-and-deploy.instructions.md` | split | Contains both deploy rules (keep) and Docker patterns (skill) | Split into trimmed instruction + new skill | `.github/instructions/deploy-rules.instructions.md` + `.github/skills/docker-patterns/SKILL.md` |
| 4 | `.github/instructions/old-api-guide.instructions.md` | delete | Superseded by `api-v2-guide.instructions.md`; references removed endpoints | Delete after confirmation | — |
| 5 | `agents/coordinator.agent.md` | protected | Agent definition file — never modified by SkillWriter | Skip | — |
```

Store the report via `memory_context(action: store, type: "classification_report")` so the Coordinator can present it to the user.

---

## 3. Cross-Workspace File Handling

### Dual-Workspace Pattern

SkillWriter operates across **two workspaces** in refactor mode:

| Concern | Workspace | ID Source |
|---------|-----------|-----------|
| Plan state, steps, context, MCP calls | **PM workspace** | `workspace_id` from deployment prompt |
| Reading/writing instruction and skill files | **Foreign workspace** | `foreign_workspace_path` from deployment prompt |

All `memory_*` tool calls use the PM `workspace_id`. All file system operations (read, create, delete) use paths relative to `foreign_workspace_path`.

### Instruction File Discovery

Scan these directories in order (stop when found):

1. `{foreign_workspace_path}/.github/instructions/*.instructions.md`
2. `{foreign_workspace_path}/instructions/*.instructions.md`
3. `{foreign_workspace_path}/.github/instructions/*.md` (non-standard naming)

Also scan for existing skills to avoid duplicates:

4. `{foreign_workspace_path}/.github/skills/*/SKILL.md`

If no files are found in standard locations, fall back to recursive glob:

5. `{foreign_workspace_path}/**/*.instructions.md` (limit depth to 3 levels)

### Optional docs/ Scanning

The `docs/` directory is **not** scanned by default. Only include it if the Coordinator's deployment prompt explicitly lists `docs/` as a scan target (e.g., `scan_directories: ["docs/"]`). When included, scan `{foreign_workspace_path}/docs/**/*.md` (depth limit 3) and apply the same classification logic.

### Skill Output Directory

New skills are always written to:

```
{foreign_workspace_path}/.github/skills/{skill-name}/SKILL.md
```

Where `{skill-name}` is derived from the source filename in kebab-case (e.g., `react-patterns.instructions.md` → `react-patterns`).

---

## 4. Protected Files

The following file types are **never** modified, deleted, or reclassified by SkillWriter:

- **Agent definitions:** `agents/*.agent.md`
- **Security instructions:** Files containing "Security Boundaries" or "immutable" markers
- **Core system files:** `*-system.instructions.md`, `*-protocol.instructions.md`
- **MCP tool references:** `mcp-tool-*.instructions.md`
- **Identity files:** `.projectmemory/identity.json`, `workspace.meta.json`

If a protected file appears during scanning, classify it as `protected` and skip it entirely.

---

## 5. Two-Phase Workflow

### Phase A: Scan & Classify (read-only)

1. Receive `foreign_workspace_path` from Coordinator deployment prompt
2. Discover instruction files using the directory scan order (§3)
3. Read each file and apply the Classification Decision Tree (§1)
4. Generate the Classification Report (§2)
5. Store report via `memory_context(action: store, type: "classification_report")`
6. Handoff to Coordinator with recommendation to present report to user
7. **No files are modified in Phase A**

### Phase B: Execute Approved Changes

1. Receive `approved_classifications` from Coordinator (user-reviewed report)
2. For each approved action:
   - **convert**: Generate SKILL.md with proper frontmatter (§7), delete original
   - **split**: Generate SKILL.md for domain content, rewrite instruction with rules only, delete original
   - **delete/consolidate**: Delete the file (merge unique content first if consolidating)
   - **keep**: No action
   - **protected**: No action (should not appear in approvals)
3. Update step status for each completed file operation
4. Handoff to Coordinator with recommendation for Reviewer

**Phase B only executes actions the user explicitly approved.** Any classification the user modifies or rejects in the report is respected.

---

## 6. Rollback Strategy

Before executing Phase B, SkillWriter **must** verify the foreign workspace is in a clean git state:

1. Check `git status` in `foreign_workspace_path` — working tree should be clean
2. If uncommitted changes exist:
   - **Warn the user** via handoff message: "Foreign workspace has uncommitted changes. Recommend `git commit` or `git stash` before proceeding."
   - **Do not proceed** with Phase B until the user confirms or overrides
3. After Phase B execution, all changes are visible via `git diff` for easy review and revert

**Recommended user workflow:**
```
git add -A && git commit -m "pre-skillwriter checkpoint"   # before Phase B
# ... SkillWriter executes Phase B ...
git diff HEAD~1                                             # review changes
git revert HEAD                                             # rollback if needed
```

---

## 7. Skill Frontmatter Generation

When converting an instruction file to a SKILL.md, generate frontmatter fields as follows:

| Field | Derivation |
|-------|-----------|
| `name` | Kebab-case from source filename (e.g., `react-patterns.instructions.md` → `react-patterns`) |
| `description` | Summarize the file's purpose as a "Use this skill when..." trigger statement |
| `category` | Map to nearest: `architecture`, `testing`, `deployment`, `frontend`, `backend`, `database`, `devops`, `security` |
| `tags` | Extract key topics, technologies, and patterns mentioned in the content |
| `language_targets` | Detect programming languages from code blocks and references |
| `framework_targets` | Detect frameworks/libraries explicitly named or demonstrated |

### Example Conversion

**Source:** `react-patterns.instructions.md` with content about component composition, hooks, and state management.

**Generated frontmatter:**
```yaml
---
name: react-patterns
description: >
  Use this skill when building React components, managing state with hooks,
  or implementing component composition patterns. Covers functional components,
  custom hooks, context providers, and render optimization.
category: frontend
tags:
  - react
  - hooks
  - state-management
  - component-patterns
language_targets:
  - typescript
  - javascript
framework_targets:
  - react
---
```

Follow the SKILL.md template format defined in the SkillWriter agent file for the body structure (sections: When to Use, Key Patterns, Common Pitfalls, File Structure, Examples).
