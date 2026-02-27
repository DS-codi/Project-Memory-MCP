# Skills Directory

This directory contains **skill definitions** for the Project Memory agent system. Skills are deployable knowledge files that provide domain-specific guidance to agents working in target workspaces.

## Structure

Each skill is a **subdirectory** containing a `SKILL.md` file:

```
skills/
├── README.md               ← This file
├── my-skill-name/
│   └── SKILL.md            ← Skill definition
├── another-skill/
│   └── SKILL.md
└── ...
```

## SKILL.md Format

Each `SKILL.md` has **YAML frontmatter** followed by Markdown content:

```markdown
---
name: my-skill-name
description: When to use this skill and what it covers.
category: frontend          # Optional: architecture | testing | deployment | frontend | backend | database | devops | security
tags:                       # Optional: freeform tags for matching
  - component-patterns
  - state-management
language_targets:            # Optional: programming languages
  - typescript
  - javascript
framework_targets:           # Optional: frameworks
  - react
  - nextjs
---

# Skill Title

Detailed instructions, patterns, code examples, and best practices...
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Unique identifier (matches directory name) |
| `description` | Yes | When/how to use this skill |
| `category` | No | Broad classification for filtering |
| `tags` | No | Freeform tags for flexible matching |
| `language_targets` | No | Languages this skill applies to |
| `framework_targets` | No | Frameworks this skill applies to |

## Deployment

Skills are deployed to target workspaces at `.github/skills/` alongside agents, instructions, and prompts. The deployment process:

1. Reads all skill subdirectories from this source directory
2. Copies each `{skill-name}/SKILL.md` to `{workspace}/.github/skills/{skill-name}/SKILL.md`
3. Agents receive matched skills in their init response based on relevance scoring

## Adding a New Skill

1. Create a new directory: `skills/my-new-skill/`
2. Create `skills/my-new-skill/SKILL.md` with frontmatter and content
3. The skill will be automatically discovered on next deployment
