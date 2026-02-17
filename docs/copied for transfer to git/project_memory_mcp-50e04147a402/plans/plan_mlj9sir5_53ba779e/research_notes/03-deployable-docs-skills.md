---
plan_id: plan_mlj9sir5_53ba779e
created_at: 2026-02-12T09:46:36.312Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Research Area 3: Deployable Docs System (for Skills Feature)

## Current Deployable Docs Architecture

### Three Types of Deployable Docs
The system currently deploys three types of docs to workspace `.github/` directories:

1. **Agent files** (`agents/*.agent.md`)
   - Deployed to: `{workspace}/.github/agents/`
   - Source: `agents/` directory in the MCP repo
   - 12 agent files: coordinator, analyst, researcher, architect, executor, builder, reviewer, tester, revisionist, archivist, brainstorm, runner
   - Format: Markdown with YAML frontmatter (name, description, tools, handoffs)

2. **Instruction files** (`instructions/*.instructions.md`)
   - Deployed to: `{workspace}/.github/instructions/`
   - Source: `instructions/` directory in MCP repo
   - 19 instruction files covering: API patterns, build scripts, components, handoff protocol, monolith avoidance, etc.
   - Applied via `.instructions.md` extension with `applyTo` frontmatter for pattern matching

3. **Prompt files** (`prompts/*.prompt.md`)
   - Deployed to: `{workspace}/.github/prompts/`
   - Source: `prompts/` directory (currently appears empty/minimal)

### Deployment Mechanism

#### Server-side (agent.tools.ts)
- `deployAgentsToWorkspace()` function in `server/src/tools/agent.tools.ts`
- Configuration via env vars: `MBS_AGENTS_ROOT`, `MBS_PROMPTS_ROOT`, `MBS_INSTRUCTIONS_ROOT`
- Default paths: relative to `process.cwd()` (e.g., `../agents`, `../instructions`)
- Copies files from source to target workspace `.github/` directories
- Logs each deployment via `appendWorkspaceFileUpdate()`

#### Extension-side (DefaultDeployer.ts)
- `DefaultDeployer` class in `vscode-extension/src/deployer/DefaultDeployer.ts`
- Takes `DeploymentConfig` with: agentsRoot, instructionsRoot, defaultAgents, defaultInstructions
- Deploys agents to `{workspace}/.github/agents/` and instructions to `{workspace}/.github/instructions/`
- Used for auto-deployment on workspace open

#### MCP Action
- `memory_agent(action: deploy)` calls `deployAgentsToWorkspace()`
- Parameters: workspace_path, agents (optional filter), include_prompts, include_instructions

### Target Skills Format (from .github/skills/)
The user's existing skills structure (in the outer workspace):
```
.github/skills/
├── pyside6-qml-architecture/
│   └── SKILL.md
├── pyside6-qml-bridge/
│   └── SKILL.md
├── pyside6-qml-models-services/
│   └── SKILL.md
└── pyside6-qml-views/
    └── SKILL.md
```

Each SKILL.md has:
- YAML frontmatter with `name` and `description` (used for matching)
- Detailed markdown content with architecture diagrams, code patterns, file structures
- Domain-specific best practices and conventions

### How VS Code Uses Skills
- Skills are defined in `.github/skills/` directories
- Each skill subfolder has a `SKILL.md`
- The `description` in frontmatter is used by VS Code to determine when to apply the skill
- VS Code Copilot automatically includes relevant skill content when the description matches the user's task

### What Needs to Change for Skills Deployment
1. **New deployable doc type**: Skills alongside agents, instructions, prompts
2. **Source storage**: Skills need to be stored in the MCP system (not just external `.github/skills/`)
3. **Skill creation agent**: A new agent or mode that writes skills based on codebase analysis
4. **Deployment mechanism**: `deployAgentsToWorkspace()` needs to also deploy skills to `{workspace}/.github/skills/`
5. **Agent awareness**: All agents need instructions to recognize and use relevant skills
6. **MBS_SKILLS_ROOT** env var for server-side skills source directory
7. **DefaultDeployer** extension needs skills deployment
8. **Dashboard** may need a skills management panel