---
plan_id: plan_mlj9sir5_53ba779e
created_at: 2026-02-12T09:48:12.956Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Research Area 6: General Architecture

## System Overview
Project Memory MCP is a local Model Context Protocol (MCP) server for managing multi-agent software development workflows with isolated workspace and plan state. It has three main components:

### 1. MCP Server (`server/`)
The core backend written in TypeScript.

#### Directory Structure
```
server/src/
├── index.ts                          # Server entry point, MCP server factory, tool registration
├── types/index.ts                    # All type definitions (~898 lines)
├── cli/                              # CLI utilities
│   ├── merge-workspace.ts
│   └── scan-ghosts.ts
├── events/
│   └── event-emitter.ts              # Event system for SSE/dashboard
├── indexing/
│   └── workspace-indexer.ts          # Codebase profiling
├── logging/
│   ├── tool-logger.ts                # Tool call logging
│   └── workspace-update-log.ts       # File change audit trail
├── security/
│   └── sanitize.ts                   # Input sanitization, injection detection
├── storage/
│   ├── file-store.ts                 # Core file I/O operations (~988 lines)
│   ├── file-lock.ts                  # File locking for concurrent access
│   ├── build-script-utils.ts         # Build script utilities
│   ├── workspace-identity.ts         # Workspace identity management
│   ├── workspace-registry.ts         # Path-to-ID registry
│   └── workspace-utils.ts            # Path normalization, ID generation
├── tools/
│   ├── agent.tools.ts                # Agent listing, deployment (~216 lines)
│   ├── agent-validation.tools.ts     # Per-agent validation (~650 lines)
│   ├── context.tools.ts              # Context CRUD (~865 lines)
│   ├── handoff.tools.ts              # Agent lifecycle, init, handoff (~549 lines)
│   ├── knowledge.tools.ts            # Knowledge file CRUD (~301 lines)
│   ├── plan.tools.ts                 # Plan lifecycle management (~2275 lines — LARGEST FILE!)
│   ├── workspace-context.tools.ts    # Workspace context CRUD (~505 lines)
│   ├── workspace.tools.ts            # Workspace operations
│   └── consolidated/                 # Consolidated MCP tool wrappers
│       ├── index.ts                  # 5 consolidated tools export
│       ├── memory_agent.ts           # 9 actions (~381 lines)
│       ├── memory_context.ts         # 16 actions (~491 lines)
│       ├── memory_plan.ts            # 18 actions (~603 lines)
│       ├── memory_steps.ts           # 10 actions
│       ├── memory_workspace.ts       # 7 actions (~243 lines)
│       └── workspace-validation.ts   # Workspace ID validation
├── transport/
│   ├── container-proxy.ts            # Container detection
│   └── http-transport.ts             # SSE/Streamable HTTP transport
├── utils/
│   ├── compact-plan-state.ts         # Compact mode for agent init (~155 lines)
│   └── workspace-context-summary.ts  # Lightweight context summaries (~107 lines)
└── __tests__/                        # Test files organized by area
```

#### Key Architectural Patterns
- **5 Consolidated MCP Tools**: memory_workspace, memory_plan, memory_steps, memory_agent, memory_context
  - Replace original 39+ individual tools
- **File-based storage**: All data persisted as JSON files in `data/` directory
- **File locking**: Concurrent access protection via file-lock.ts
- **Security**: Input sanitization, prompt injection detection via sanitize.ts
- **Event system**: Server-Sent Events for real-time dashboard updates

#### Notable Large Files (candidates for refactoring)
- `plan.tools.ts`: ~2275 lines — plan lifecycle, step management, templates, build scripts, confirmation
- `file-store.ts`: ~988 lines — all disk I/O operations
- `context.tools.ts`: ~865 lines — context storage and instruction generation
- `types/index.ts`: ~898 lines — all types in one file
- `agent-validation.tools.ts`: ~650 lines — per-agent validation functions
- `coordinator.agent.md`: ~1198 lines — comprehensive coordinator instructions

### 2. Dashboard (`dashboard/`)
React + TypeScript frontend for managing workspaces, plans, and agents.

#### Structure
```
dashboard/src/
├── api/                    # API client
├── App.tsx                 # Root component
├── components/             # UI components
│   ├── common/             # Shared components (CollapsibleSection, etc.)
│   ├── workspace/          # Workspace-specific components
│   │   ├── WorkspaceContextPanel.tsx
│   │   ├── KnowledgeFilesPanel.tsx
│   │   ├── KnowledgeFileForm.tsx
│   │   └── KnowledgeFileViewer.tsx
│   └── ...
├── config.ts               # Configuration
├── hooks/                  # React hooks
├── lib/                    # Utility libraries
├── main.tsx                # Entry point
├── pages/                  # Page components
├── store/                  # State management
├── styles/                 # CSS/Tailwind styles
├── types/                  # TypeScript types
└── utils/                  # Utility functions
```

#### Key Dashboard Features
- Workspace management: list, select, view details
- Plan tracking: view steps, progress, agent sessions
- Knowledge file management: view, create, edit
- Workspace context viewer with dynamic sections
- Real-time updates via SSE

### 3. VS Code Extension (`vscode-extension/`)
Provides chat integration and workspace management from within VS Code.

#### Structure
```
vscode-extension/src/
├── chat/
│   ├── ChatParticipant.ts           # Main chat handler
│   ├── KnowledgeCommandHandler.ts   # /knowledge command handling
│   ├── McpBridge.ts                 # MCP server communication
│   ├── ToolProvider.ts              # Tool definitions for chat
│   └── tools/                       # Chat tools
├── commands/                        # VS Code commands
├── deployer/
│   └── DefaultDeployer.ts           # Agent/instruction deployment
├── extension.ts                     # Extension entry point
├── providers/                       # VS Code providers
├── server/                          # MCP server management
├── services/                        # Service layer
├── ui/                              # UI components
├── utils/                           # Utilities
└── watchers/                        # File watchers
```

#### Key Extension Features
- Chat participant (`@project-memory`)
- Slash commands: /context, /knowledge, etc.
- Auto-deployment of agents/instructions on workspace open
- MCP server bridge for tool execution
- File watchers for state changes

### 4. Data Storage (data/)
```
data/
├── workspace-registry.json          # Global path → workspace_id mapping
├── {workspace_id}/
│   ├── workspace.meta.json          # Workspace metadata
│   ├── workspace.context.json       # Workspace-level context
│   ├── knowledge/                   # Knowledge files
│   │   └── {slug}.json
│   └── plans/
│       ├── {plan_id}/
│       │   ├── state.json           # Full plan state
│       │   ├── plan.md              # Human-readable plan
│       │   ├── original_request.json
│       │   ├── research_notes/      # Research documents
│       │   ├── logs/                # Tool call logs
│       │   └── {type}.json          # Context files
│       └── _archived/              # Archived plans
├── events/                          # SSE event logs
└── logs/                            # Server logs
```

### 5. Supporting Files
- **Agents** (`agents/`): 12 `.agent.md` files with agent instructions
- **Instructions** (`instructions/`): 19 `.instructions.md` files for workspace-level guidance
- **Skills** (`.github/skills/` in outer workspace): 4 PySide6/QML skill files (template format)
- **Docs** (`docs/`): Documentation files