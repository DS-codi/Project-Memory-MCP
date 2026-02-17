---
plan_id: plan_mlkl7hle_541c62b3
created_at: 2026-02-13T18:07:42.273Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# SKILL.md Template Structure & Skills Discovery Mechanism

## Findings from Examining Existing Skills

Examined: `coordinator-categorization/SKILL.md` (89 lines), `analyst-methodology/SKILL.md` (287 lines), `react-components/SKILL.md` (50 lines), `message-broker/SKILL.md` (430 lines)

---

## 1. SKILL.md Template Structure

### Frontmatter Format

```yaml
---
name: skill-name-kebab-case
description: "Use this skill when [trigger condition]. Covers [topics]. Includes [specific content types]."
---
```

**Optional frontmatter fields** (supported by `skills.tools.ts` but not widely used yet):
```yaml
category: architecture|testing|deployment|frontend|backend|database|devops|security
tags:
  - tag1
  - tag2
language_targets:
  - typescript
  - python
framework_targets:
  - react
  - pyside6
```

### Key Observations:
- `name` — kebab-case, matches directory name
- `description` — starts with "Use this skill when..." trigger phrase, very important for matching
- `category`, `tags`, `language_targets`, `framework_targets` — optional structured metadata for matching (defined in `skill.types.ts`)
- Only `name` and `description` are used in most existing skills; the structured fields are newer

### Body Structure

There is **no rigid template** — skills vary significantly in structure. Common patterns:

| Skill | Lines | Structure Style |
|-------|-------|----------------|
| coordinator-categorization | 89 | Decision tables, keyword triggers, deployment patterns |
| analyst-methodology | 287 | Investigation model diagrams, knowledge base layouts, experiment templates, checklists |
| react-components | 50 | Bullet list guidelines: component structure, naming, state mgmt, testing |
| message-broker | 430 | Full protocol spec: architecture diagram, frame format, JSON-RPC, code patterns |

**Common sections observed:**
1. H1 title matching the skill topic
2. Introductory sentence (when to use)
3. Content organized by topic (tables, diagrams, code examples, patterns)
4. No prescribed section headings — content-driven

### Naming Conventions:
- **Directory:** `kebab-case-topic-name/` (e.g., `coordinator-categorization/`, `analyst-methodology/`)
- **File:** Always `SKILL.md` (uppercase, markdown extension)
- **Frontmatter name:** matches directory name

---

## 2. How Skills Are Discovered by `skills.tools.ts`

### Source Location:
- Server skills root: `process.env.MBS_SKILLS_ROOT || path.join(process.cwd(), '..', 'skills')`  
- Workspace skills: `{workspace_path}/.github/skills/`

### Discovery Flow:

1. **`listSkills()`** — reads all subdirectories of the skills root, looks for `SKILL.md` in each
2. **`parseFrontmatter()`** — extracts YAML frontmatter (name, description, category, tags, language_targets, framework_targets)
3. **`matchSkillsToContext(task_description)`** — scores each skill against a task description
4. **`matchWorkspaceSkillsToContext(workspace_path, task_description)`** — same but checks `.github/skills/` first, falls back to server skills

### Scoring Algorithm (`scoreSkill()`):
- **Keyword matching (40% weight):** Tokenizes task description and skill content (name + description + first 500 chars), counts matching words
- **Category matching (20% weight):** Checks if skill category appears in task description
- **Language matching (20% weight):** Checks if language_targets appear in task
- **Tag matching (20% weight):** Checks if tags appear in task

### Key Implication for New Skills:
- **Description field is critical** — it's used directly in matching
- **First 500 chars of body** also contribute to keyword matching
- Adding `tags` and `category` significantly improves discoverability
- Skills deployed to `.github/skills/` in target workspaces get workspace-specific matching with tech stack detection boost

### Deployment:
- `deploySkillsToWorkspace(workspace_path)` copies all `{skill}/SKILL.md` files to `{workspace}/.github/skills/{skill}/SKILL.md`
- Called via `memory_agent(action: deploy, include_skills: true)`
- For the PM workspace itself, skills live under `Project-Memory-MCP/skills/` (server-side source of truth)

---

## 3. Recommended Template for New PM Skills

Based on analysis, the new PM-specific skills should follow this template:

```markdown
---
name: {kebab-case-name}
description: "Use this skill when {trigger condition}. Covers {topic list}."
category: {appropriate category or omit}
tags:
  - project-memory
  - {additional tags}
---

# {Title}

{Brief intro: what this skill covers}

## Key Concepts

{Tables, definitions, or concept explanations}

## Patterns / Workflows

{How-to sections, diagrams, examples}

## Common Pitfalls

{Anti-patterns specific to this domain}

## Agent-Specific Tips

{Tips organized by agent role, if applicable}
```

**Category recommendations for new PM skills:**
- `project-memory-overview` → no category (meta/overview)
- `agent-handoff` → `architecture` 
- `mcp-tools-usage` → no category (tool usage is cross-cutting)
- `build-scripts` → `devops`
- `plan-context` → no category (data management)
- `workspace-management` → `devops`
