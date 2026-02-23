---
plan_id: plan_ml72da5d_09189d1a
created_at: 2026-02-03T20:44:56.346Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# MCP Tool System Architecture

## Consolidated Tools (v2.0)

### File: `server/src/tools/consolidated/index.ts`

The system uses **5 consolidated tools** that replaced 39 individual tools:

1. **memory_workspace** - Workspace management (4 actions)
2. **memory_plan** - Plan lifecycle (8 actions)
3. **memory_steps** - Step management (3 actions)
4. **memory_agent** - Agent lifecycle (9 actions)
5. **memory_context** - Context/research (7 actions)

## Tool Structure

### Consolidated Tool Pattern
```typescript
// Example: memory_workspace.ts
export type WorkspaceAction = 'register' | 'list' | 'info' | 'reindex';

export interface MemoryWorkspaceParams {
  action: WorkspaceAction;
  workspace_path?: string;  // for register
  workspace_id?: string;    // for info, reindex
}

export async function memoryWorkspace(
  params: MemoryWorkspaceParams
): Promise<ToolResponse<WorkspaceResult>> {
  const { action } = params;
  
  switch (action) {
    case 'register':
      // Implementation
      break;
    case 'list':
      // Implementation
      break;
    // ... other actions
  }
}
```

### Tool Registration
File: `server/src/index.ts`
- Tools are registered with MCP SDK
- Each tool has JSON schema for parameters
- Tools return standardized `ToolResponse<T>` format

## Existing Tool Actions

### memory_workspace
- `register` - Register new workspace directory
- `list` - List all workspaces
- `info` - Get workspace details and plans
- `reindex` - Update codebase profile after changes

### memory_plan
- `list` - List plans (all or for workspace)
- `get` - Get plan state
- `create` - Create new plan
- `update` - Modify plan steps
- `archive` - Archive completed plan
- `import` - Import existing plan file
- `find` - Find plan by ID
- `add_note` - Add note to plan

### memory_steps
- `add` - Append new steps
- `update` - Update single step status
- `batch_update` - Update multiple steps

### memory_agent
- `init` - Record agent activation
- `complete` - Mark session complete
- `handoff` - Transfer to next agent
- `validate` - Verify correct agent for task
- `list` - List available agents
- `get_instructions` - Get agent instructions
- `deploy` - Deploy agents to workspace
- `get_briefing` - Get mission briefing
- `get_lineage` - Get handoff history

### memory_context
- `store` - Store context data
- `get` - Retrieve context
- `store_initial` - Store initial user request
- `list` - List context files
- `list_research` - List research notes
- `append_research` - Add research note
- `generate_instructions` - Generate plan instructions file

## Adding Custom Workspace Tools (Build Scripts)

### Option 1: Extend Existing Tools

Add actions to `memory_plan`:
```typescript
// In memory_plan.ts
export type PlanAction = 
  | 'list' | 'get' | 'create' | 'update' | 'archive' | 'import' | 'find' | 'add_note'
  | 'add_build_script' | 'list_build_scripts' | 'update_build_script';

case 'add_build_script': {
  if (!params.workspace_id || !params.plan_id || !params.script) {
    return { success: false, error: 'Missing required parameters' };
  }
  await addBuildScript(params.workspace_id, params.plan_id, params.script);
  return { success: true, data: { action: 'add_build_script', data: params.script } };
}
```

### Option 2: Create New Consolidated Tool

File: `server/src/tools/consolidated/memory_builds.ts`
```typescript
export type BuildAction = 
  | 'add_script' 
  | 'list_scripts' 
  | 'update_script' 
  | 'delete_script'
  | 'run_script';

export interface MemoryBuildsParams {
  action: BuildAction;
  workspace_id: string;
  plan_id?: string;  // Optional - null means workspace-level
  script?: BuildScript;
  script_id?: string;
}

export async function memoryBuilds(
  params: MemoryBuildsParams
): Promise<ToolResponse<BuildResult>> {
  // Implementation
}
```

### Option 3: Expose as Custom Workspace MCP Tools

**More advanced**: Dynamically register build scripts as MCP tools per workspace.

```typescript
// Pseudo-code
async function registerWorkspaceBuildTools(workspaceId: string) {
  const scripts = await getBuildScripts(workspaceId);
  
  for (const script of scripts) {
    if (script.mcp_handle) {
      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          // ... existing tools
          {
            name: `build_${script.mcp_handle}`,
            description: script.description,
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      }));
      
      server.setRequestHandler(CallToolRequestSchema, async (request) => {
        if (request.params.name === `build_${script.mcp_handle}`) {
          // Execute build script
          return executeBuildScript(workspaceId, script);
        }
      });
    }
  }
}
```

**Challenge**: MCP tools are registered at server startup, not dynamically.
**Solution**: Reload MCP server when scripts change, or use single `execute_build_script` tool with script ID parameter.

### Recommended Approach

**Add to memory_plan tool** (simplest):
```typescript
// Agents can call:
memory_plan({ 
  action: 'add_build_script',
  workspace_id: 'ws123',
  plan_id: 'plan456',
  script: {
    name: 'Build Server',
    description: 'Build TypeScript server',
    required_directory: 'server',
    command: 'npm run build'
  }
})

memory_plan({
  action: 'run_build_script',
  workspace_id: 'ws123',
  plan_id: 'plan456',
  script_id: 'script789'
})
```

## Tool Response Format

```typescript
interface ToolResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

All tools return this standardized format for consistent error handling.
