import { Router } from 'express';

export const sprintsRouter = Router();

// MCP proxy endpoint for sprint operations
const MCP_BASE_URL = process.env.MCP_BASE_URL || 'http://127.0.0.1:3457';

interface McpToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Call the memory_sprint MCP tool via the admin HTTP endpoint.
 */
async function callSprintTool(args: Record<string, unknown>): Promise<McpToolResponse> {
  const url = `${MCP_BASE_URL}/admin/mcp_call`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'memory_sprint', arguments: args }),
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      success: false,
      error: `MCP call failed: ${response.status} ${response.statusText} - ${text}`,
    };
  }

  return response.json() as Promise<McpToolResponse>;
}

/**
 * Extract data or throw error from MCP response.
 */
function unwrapMcpResponse<T>(response: McpToolResponse): T {
  if (!response.success) {
    throw new Error(response.error || 'Unknown MCP error');
  }
  return response.data as T;
}

// ============================================================================
// GET /sprints/workspace/:workspaceId - List sprints for a workspace
// ============================================================================
sprintsRouter.get('/workspace/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const includeArchived = req.query.includeArchived === 'true';

    const result = await callSprintTool({
      action: 'list',
      workspace_id: workspaceId,
      include_archived: includeArchived,
    });

    const data = unwrapMcpResponse<{ sprints: unknown[]; count: number }>(result);
    res.json(data);
  } catch (error) {
    console.error('Error listing sprints:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list sprints' });
  }
});

// ============================================================================
// GET /sprints/:sprintId - Get sprint detail
// ============================================================================
sprintsRouter.get('/:sprintId', async (req, res) => {
  try {
    const { sprintId } = req.params;

    const result = await callSprintTool({
      action: 'get',
      sprint_id: sprintId,
    });

    const data = unwrapMcpResponse<unknown>(result);
    res.json(data);
  } catch (error) {
    console.error('Error getting sprint:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get sprint' });
  }
});

// ============================================================================
// POST /sprints - Create a new sprint
// ============================================================================
sprintsRouter.post('/', async (req, res) => {
  try {
    const { workspace_id, title, goals, status } = req.body;

    if (!workspace_id) {
      return res.status(400).json({ error: 'workspace_id is required' });
    }
    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    const result = await callSprintTool({
      action: 'create',
      workspace_id,
      title,
      goals: goals || [],
      status: status || 'active',
    });

    const data = unwrapMcpResponse<unknown>(result);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating sprint:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create sprint' });
  }
});

// ============================================================================
// PATCH /sprints/:sprintId - Update a sprint
// ============================================================================
sprintsRouter.patch('/:sprintId', async (req, res) => {
  try {
    const { sprintId } = req.params;
    const { title, status, goals } = req.body;

    const args: Record<string, unknown> = {
      action: 'update',
      sprint_id: sprintId,
    };

    if (title !== undefined) args.title = title;
    if (status !== undefined) args.status = status;
    if (goals !== undefined) args.goals = goals;

    const result = await callSprintTool(args);
    const data = unwrapMcpResponse<unknown>(result);
    res.json(data);
  } catch (error) {
    console.error('Error updating sprint:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update sprint' });
  }
});

// ============================================================================
// DELETE /sprints/:sprintId - Delete a sprint
// ============================================================================
sprintsRouter.delete('/:sprintId', async (req, res) => {
  try {
    const { sprintId } = req.params;
    const confirm = req.query.confirm === 'true';

    const result = await callSprintTool({
      action: 'delete',
      sprint_id: sprintId,
      confirm,
    });

    const data = unwrapMcpResponse<unknown>(result);
    res.json(data);
  } catch (error) {
    console.error('Error deleting sprint:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to delete sprint' });
  }
});

// ============================================================================
// POST /sprints/:sprintId/goals - Add a goal to a sprint
// ============================================================================
sprintsRouter.post('/:sprintId/goals', async (req, res) => {
  try {
    const { sprintId } = req.params;
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }

    const result = await callSprintTool({
      action: 'add_goal',
      sprint_id: sprintId,
      goal_description: description,
    });

    const data = unwrapMcpResponse<unknown>(result);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error adding goal:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to add goal' });
  }
});

// ============================================================================
// PATCH /sprints/:sprintId/goals/:goalId - Update or complete a goal
// ============================================================================
sprintsRouter.patch('/:sprintId/goals/:goalId', async (req, res) => {
  try {
    const { sprintId, goalId } = req.params;
    const { completed } = req.body;

    // If completed is provided, use complete_goal action
    if (completed !== undefined) {
      const result = await callSprintTool({
        action: 'complete_goal',
        sprint_id: sprintId,
        goal_id: goalId,
      });

      const data = unwrapMcpResponse<unknown>(result);
      return res.json(data);
    }

    // Otherwise this is a no-op for now (goal updates not yet supported)
    res.json({ message: 'Goal updated' });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update goal' });
  }
});

// ============================================================================
// DELETE /sprints/:sprintId/goals/:goalId - Remove a goal from a sprint
// ============================================================================
sprintsRouter.delete('/:sprintId/goals/:goalId', async (req, res) => {
  try {
    const { sprintId, goalId } = req.params;

    const result = await callSprintTool({
      action: 'remove_goal',
      sprint_id: sprintId,
      goal_id: goalId,
    });

    const data = unwrapMcpResponse<unknown>(result);
    res.json(data);
  } catch (error) {
    console.error('Error removing goal:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to remove goal' });
  }
});
