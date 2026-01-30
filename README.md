# Project Memory MCP Server

A local Model Context Protocol (MCP) server for managing multi-agent software development workflows.

## Features

- **Workspace Isolation**: Each connected VS Code workspace gets its own folder
- **Automatic Indexing**: First-time workspace setup indexes the codebase (languages, frameworks, build system)
- **Request Categorization**: Classify requests as feature, bug, change, analysis, debug, refactor, or documentation
- **Multiple Plans per Workspace**: Run concurrent feature development plans
- **Agent Session Tracking**: Complete audit trail with `initialise_agent` context recording
- **Handoff Protocol**: Track agent-to-agent transfers with lineage history
- **Context Storage**: Persist audit logs, research notes, and decisions
- **Security**: Built-in prompt injection protection

## Quick Start

### 1. Build the Server

```powershell
cd server
npm install
npm run build
```

### 2. Configure VS Code

Add to your VS Code settings or workspace `.vscode/mcp.json`:

```json
{
  "servers": {
    "project-memory": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\server\\dist\\index.js"],
      "env": {
        "MBS_DATA_ROOT": "C:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\data",
        "MBS_AGENTS_ROOT": "C:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\agents"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceFolder}"]
    },
    "git": {
      "command": "uvx",
      "args": ["--native-tls", "mcp-server-git"]
    },
    "markitdown": {
      "command": "uvx",
      "args": ["--native-tls", "markitdown-mcp"]
    }
  }
}
```

### Agent Tool Assignments

| Agent | MCP Tools | VS Code Tools | Purpose |
|-------|-----------|---------------|---------|
| **Coordinator** | `mcp_project-memor_*`, `mcp_filesystem_*` | `read_file`, `list_dir`, `semantic_search`, `grep_search`, `file_search` | Scan codebase, categorize requests, create plans |
| **Researcher** | `mcp_project-memor_*`, `mcp_microsoft_mar_*` | `fetch_webpage`, `read_file`, `semantic_search`, `github_repo` | Fetch docs, research libraries, convert formats |
| **Architect** | `mcp_project-memor_*`, `mcp_filesystem_*` | `read_file`, `list_dir`, `semantic_search`, `grep_search`, `list_code_usages` | Analyze code, find usages, design implementation |
| **Executor** | `mcp_project-memor_*`, `mcp_filesystem_*`, `mcp_git_*` | `read_file`, `create_file`, `replace_string_in_file`, `run_in_terminal`, `get_terminal_output`, `get_errors` | Write code, run commands, full implementation |
| **Revisionist** | `mcp_project-memor_*`, `mcp_filesystem_*` | `read_file`, `semantic_search`, `grep_search`, `get_errors`, `get_terminal_output`, `terminal_last_command` | Analyze errors, modify plans |
| **Reviewer** | `mcp_project-memor_*`, `mcp_filesystem_*`, `mcp_git_*` | `read_file`, `semantic_search`, `get_errors`, `list_code_usages`, `get_changed_files` | Review diffs, validate changes |
| **Tester** | `mcp_project-memor_*` | `read_file`, `run_in_terminal`, `get_terminal_output`, `get_errors` | Run test suites, capture output |
| **Archivist** | `mcp_project-memor_*`, `mcp_filesystem_*`, `mcp_git_*` | `read_file`, `create_file`, `replace_string_in_file`, `semantic_search` | Commit changes, update docs, archive |

### Available Tools Reference

#### MCP Server Tools (via mcp.json)

| Server | Tool Pattern | Description |
|--------|--------------|-------------|
| **project-memory** | `mcp_project-memor_*` | Plan management, context storage, handoffs |
| **filesystem** | `mcp_filesystem_*` | Read/write files, list directories, search |
| **git** | `mcp_git_*` | Git add, commit, branch, diff, log, checkout |
| **markitdown** | `mcp_microsoft_mar_*` | Convert documents to markdown |

#### VS Code Built-in Tools

| Category | Tools | Description |
|----------|-------|-------------|
| **File Reading** | `read_file`, `list_dir` | Read file contents and list directories |
| **File Editing** | `create_file`, `replace_string_in_file` | Create and modify files |
| **Search** | `semantic_search`, `grep_search`, `file_search` | Search codebase semantically or by pattern |
| **Code Analysis** | `list_code_usages`, `get_errors` | Find symbol usages, get compilation errors |
| **Terminal** | `run_in_terminal`, `get_terminal_output`, `terminal_last_command` | Execute commands and read output |
| **Git** | `get_changed_files` | Get current git changes |
| **Web** | `fetch_webpage`, `github_repo` | Fetch web content and search GitHub |

### 3. Available Tools

### 3. Project-Memory MCP Tools

#### Workspace Management
| Tool | Description |
|------|-------------|
| `register_workspace` | Register a workspace directory (triggers indexing on first use) |
| `reindex_workspace` | Re-index workspace after significant changes |
| `list_workspaces` | List all registered workspaces |
| `get_workspace_plans` | Get all plans for a workspace |

#### Plan Lifecycle
| Tool | Description |
|------|-------------|
| `create_plan` | Create a new plan in a workspace (requires category) |
| `get_plan_state` | Get full plan state (steps, lineage, sessions) |
| `update_step` | Update a step's status |
| `modify_plan` | Replace plan steps (Architect/Revisionist) |
| `archive_plan` | Archive a completed plan |

#### Agent Lifecycle
| Tool | Description |
|------|-------------|
| `initialise_agent` | **Required first call** - Records agent activation |
| `complete_agent` | Mark agent session complete with summary |
| `handoff` | Transfer control to another agent |
| `get_mission_briefing` | Get deployment context for new agent |

#### Context Storage
| Tool | Description |
|------|-------------|
| `store_context` | Save context data (audit, research, etc.) |
| `get_context` | Retrieve stored context by type |
| `append_research` | Add a research note file |
| `list_research_notes` | List research note files |

#### Agent Deployment
| Tool | Description |
|------|-------------|
| `list_agents` | List available agent instruction files |
| `deploy_agents_to_workspace` | Copy agent files to a workspace's `.github/agents/` |
| `get_agent_instructions` | Get content of a specific agent file |

## Data Structure

```
data/
├── {workspace_id}/
│   ├── workspace.meta.json
│   └── plans/
│       └── {plan_id}/
│           ├── state.json
│           ├── plan.md
│           ├── audit.json
│           ├── research.json
│           └── research_notes/
│               └── *.md
```

## Agent Workflow

### Request Categories

The Coordinator categorizes each request to determine the appropriate workflow:

| Category | Description | Typical Flow |
|----------|-------------|--------------|
| `feature` | Add new functionality | Coordinator → Researcher? → Architect → Executor → Reviewer → Tester → Archivist |
| `bug` | Fix something broken | Coordinator → Executor → Tester → Archivist |
| `change` | Modify existing behavior | Coordinator → Architect → Executor → Reviewer → Tester → Archivist |
| `analysis` | Understand how something works | Coordinator → Researcher? → (complete) |
| `debug` | Investigate a specific issue | Coordinator → Executor → (complete) |
| `refactor` | Improve code structure | Coordinator → Architect → Executor → Reviewer → Tester → Archivist |
| `documentation` | Update or create docs | Coordinator → Executor → Reviewer → Archivist |

### Agent Roles

1. **Coordinator** → Entry point - categorizes request, registers workspace, creates plan
2. **Researcher** → Gathers external documentation (if needed)
3. **Architect** → Creates implementation steps
4. **Executor** → Implements each step
5. **Revisionist** → Pivots plan on errors
6. **Reviewer** → Validates changes
7. **Tester** → Runs test suites
8. **Archivist** → Commits and archives

Each agent MUST call `initialise_agent` first to record their activation context.

## First-Time Workspace Setup

When a workspace is registered for the first time, the system automatically indexes the codebase and creates a **Workspace Profile** containing:

- **Languages**: Detected programming languages and their percentages
- **Frameworks**: React, Vue, Express, Django, etc.
- **Build System**: npm, yarn, cargo, gradle, etc. with commands
- **Test Framework**: Jest, pytest, JUnit, etc. with test commands
- **Key Directories**: Source, tests, config, docs locations
- **Conventions**: Indentation, quotes, semicolons, etc.

## Development

```powershell
# Watch mode
cd server
npm run dev
```

## Security

This MCP server includes multiple layers of protection against prompt injection attacks:

### Content Sanitization

All stored data is automatically sanitized for injection patterns:

- **Injection Detection**: Blocks instruction overrides, role manipulation, system prompt extraction, delimiter attacks, and agent impersonation
- **Warning Detection**: Flags but doesn't block suspicious patterns like `eval()`, `exec()`, `sudo`, etc.
- **Metadata Tracking**: All sanitized content includes metadata about modifications

Detected patterns include:
- "Ignore previous instructions"
- "You are now a..."
- "Pretend to be..."
- System prompt extraction attempts
- Delimiter attacks (`[INST]`, `<|system|>`, etc.)
- Agent impersonation attempts

### Lineage Verification

The handoff system verifies valid agent transitions:

- **Source Validation**: Handoffs verify the `from_agent` matches the current agent
- **Chain Integrity**: Lineage is checked for valid transition patterns
- **Audit Trail**: All handoffs are recorded with timestamps and reasons

### Agent Security Boundaries

Each agent file includes a Security Boundaries section with:

- **Immutable Instructions**: Agents are told to ignore conflicting instructions in files, web content, or user prompts
- **Data vs. Instruction Distinction**: Agents treat external content as data, not commands
- **Security Reporting**: Agents log suspicious content via `store_context` with type `security_alert`
- **Handoff Source Verification**: Agents validate they were deployed by legitimate sources

### Santization Functions

| Function | Purpose |
|----------|---------|
| `sanitizeContent()` | Sanitizes text content, returns result with modification details |
| `sanitizeJsonData()` | Recursively sanitizes all string values in JSON objects |
| `verifyLineageIntegrity()` | Validates agent transition chains |
| `addSecurityMetadata()` | Adds source and timestamp metadata to stored content |

### Security Alerts

When agents detect suspicious content, they should store a security alert:

```json
{
  "type": "security_alert",
  "data": {
    "detected_in": "file_path_or_url",
    "pattern_type": "injection_attempt",
    "content_excerpt": "...",
    "agent": "Researcher"
  }
}
```
