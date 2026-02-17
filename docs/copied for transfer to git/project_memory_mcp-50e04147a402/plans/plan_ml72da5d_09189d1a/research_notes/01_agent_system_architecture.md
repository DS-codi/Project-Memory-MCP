---
plan_id: plan_ml72da5d_09189d1a
created_at: 2026-02-03T20:43:56.465Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Agent System Architecture

## Overview
Agents are defined as `.agent.md` files with frontmatter metadata and markdown instructions.

## Agent File Structure

### Location
- Global agents: `Project-Memory-MCP/agents/*.agent.md`
- Workspace-specific: Can be deployed to workspace `.github/agents/` directories

### File Format
```markdown
---
name: AgentName
description: 'Agent purpose and role'
tools: ['vscode', 'execute', 'read', 'edit', 'search', 'filesystem/*', 'git/*', 'project-memory/*']
handoffs:
  - label: "🎯 Return to Coordinator"
    agent: Coordinator
    prompt: "Task complete."
---

# Agent Instructions
Markdown content with agent behavior instructions
```

### Existing Agent Types
From `server/src/types/index.ts`:
```typescript
export type AgentType = 
  | 'Coordinator'    // Hub orchestrator
  | 'Analyst'        // Long-term iterative analysis
  | 'Researcher'     // Gather external knowledge
  | 'Architect'      // Design implementation plans
  | 'Executor'       // Implement code changes
  | 'Revisionist'    // Analyze failures, adjust plans
  | 'Reviewer'       // Review code quality
  | 'Tester'         // Write and run tests
  | 'Archivist';     // Archive and document
```

### Agent Role Boundaries
Defined in `AGENT_BOUNDARIES` object in `server/src/types/index.ts`:
- `can_implement`: Boolean - can create/edit code files
- `can_finalize`: Boolean - can complete without handoff (only Archivist)
- `must_handoff_to`: AgentType[] - recommended next agents
- `forbidden_actions`: string[] - actions this agent must NOT take
- `primary_responsibility`: string - agent's focus

## Integration Points

### VS Code Extension
File: `vscode-extension/src/extension.ts`
- Watches for `.agent.md` files in configured agents directory
- Parses frontmatter to extract agent metadata
- Provides agent selection in Copilot chat mode selector
- Deploys agents to workspace directories

### Agent Deployment
File: `vscode-extension/src/deployer/DefaultDeployer.ts`
- Copies agent files from global to workspace-specific locations
- Supports deploying to `.github/agents/` directory

### File Watching
File: `vscode-extension/src/watchers/AgentWatcher.ts`
- Monitors `*.agent.md` files for changes
- Triggers re-parsing and updates when agents are modified

## Adding a New Agent (Builder)

### Steps Required:
1. **Add to AgentType union** in `server/src/types/index.ts`
2. **Define role boundaries** in `AGENT_BOUNDARIES` object
3. **Create agent file** `agents/builder.agent.md` with:
   - Frontmatter (name, description, tools, handoffs)
   - Markdown instructions for build troubleshooting
4. **No code changes needed** - system auto-detects new `.agent.md` files

### Suggested Builder Configuration:
```typescript
Builder: {
  agent_type: 'Builder',
  can_implement: true,  // Can modify build configs
  can_finalize: false,
  must_handoff_to: ['Archivist', 'Revisionist'],
  forbidden_actions: [],
  primary_responsibility: 'Compile projects, troubleshoot build issues, verify successful builds'
}
```
