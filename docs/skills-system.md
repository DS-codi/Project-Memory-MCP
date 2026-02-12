# Skills System

## Overview

Skills are structured knowledge files that encode domain-specific patterns, conventions, and best practices. They are deployed to workspaces as `.github/skills/*/SKILL.md` files and automatically matched to agents during session initialization based on task context and workspace tech stack.

## SKILL.md Format

Every skill file follows a structured format with YAML frontmatter and markdown body:

```markdown
---
name: skill-name
description: Brief description of what this skill covers
category: architecture | testing | ui | api | data | devops | patterns
tags:
  - tag1
  - tag2
language_targets:
  - typescript
  - python
framework_targets:
  - react
  - express
---

# Skill Title

## Overview
What this skill covers and when to use it.

## Patterns
Detailed patterns, conventions, and code examples.

## Best Practices
Do's and don'ts for this domain.

## Examples
Concrete code examples showing correct usage.
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | URL-safe skill identifier |
| `description` | Yes | Brief description shown in skill listings |
| `category` | No | High-level category for organization |
| `tags` | No | Fine-grained tags for discovery and matching |
| `language_targets` | No | Programming languages this skill applies to |
| `framework_targets` | No | Frameworks this skill is relevant for |

## Skill Matching

When an agent calls `memory_agent(action: init)`, the system automatically matches workspace skills against the current task context:

### Matching Pipeline

1. **Tech stack detection** — Scans workspace for `package.json`, `tsconfig.json`, `requirements.txt`, etc. to identify languages and frameworks
2. **Registry filtering** — Filters skills by `language_targets` and `framework_targets` against detected tech stack
3. **Keyword scoring** — Scores each skill against the task description and plan context using tag and description matching
4. **Relevance ranking** — Returns top matches sorted by relevance score
5. **Content inclusion** — Top 3 skills include their full content; others include metadata only

### Scoring Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| Language match | High | Skill targets a language used in the workspace |
| Framework match | High | Skill targets a framework detected in the workspace |
| Tag relevance | Medium | Skill tags overlap with task keywords |
| Category match | Low | Skill category aligns with step type |

## Deployment

### Via MCP Tool

Deploy skills to any workspace using the agent deploy action:

```json
{
  "action": "deploy",
  "workspace_path": "/home/user/my-project",
  "include_skills": true
}
```

This copies all skills from the source skills directory (`MBS_SKILLS_ROOT` or `skills/`) into the target workspace's `.github/skills/` folder.

### Via VS Code Extension

Use the Command Palette:
- `Project Memory: Deploy All Copilot Config` — Deploys agents, prompts, instructions, and skills
- `Project Memory: Deploy Agents to Workspace` — Select skills to include

### Manual Deployment

Copy skill directories to your workspace:

```
your-project/
└── .github/
    └── skills/
        └── my-skill/
            └── SKILL.md
```

## SkillWriter Agent

The SkillWriter is a specialized spoke agent that analyzes codebases and generates SKILL.md files automatically.

### What SkillWriter Does

1. **Reads source files** — Scans project structure, configuration files, and source code
2. **Identifies patterns** — Detects architectural patterns, naming conventions, testing strategies
3. **Generates SKILL.md** — Creates structured skill files with proper frontmatter and content
4. **Validates format** — Ensures generated skills follow the required format

### What SkillWriter Cannot Do

- Modify source code files
- Create or edit test files
- Run builds or tests
- Modify agent definitions

### When to Use SkillWriter

- After setting up a new project with established patterns
- When onboarding agents to an existing codebase
- When frequently explaining the same conventions to agents

## Agent Integration

All agents include a **Skills Awareness** section instructing them to:

1. Check `matched_skills` from `memory_agent(action: init)` response
2. Apply skill patterns when working in matching domains
3. Maintain consistency with established conventions

## Directory Structure

```
skills/                          # Source skills (in MCP server root)
├── README.md                    # Skills system overview
└── skill-name/
    └── SKILL.md                 # Skill definition file

.github/skills/                  # Deployed skills (in target workspace)
└── skill-name/
    └── SKILL.md
```

## Available Skills

Skills are workspace-specific. The system ships with example skills that can be customized per project. See the `skills/` directory in the Project Memory MCP repository for bundled examples.
