/**
 * Tool catalog — tools, actions, and parameters stored in DB.
 *
 * The catalog is seeded on server start (idempotent) and can be queried
 * by agents to discover available MCP tools and their action signatures.
 */

import type { ToolRow, ToolActionRow, ToolActionParamRow, ToolHelp } from './types.js';
import { queryOne, queryAll, run, transaction, newId } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Seed types
// ---------------------------------------------------------------------------

export interface CatalogParam {
  name:           string;
  type?:          string;
  required?:      boolean;
  description?:   string;
  default_value?: string | null;
}

export interface CatalogAction {
  name:        string;
  description?: string;
  params?:     CatalogParam[];
}

export interface CatalogTool {
  name:         string;
  description?: string;
  actions:      CatalogAction[];
}

// ---------------------------------------------------------------------------
// Seed (idempotent)
// ---------------------------------------------------------------------------

export function seedToolCatalog(catalog: CatalogTool[]): void {
  transaction(() => {
    for (const tool of catalog) {
      // Upsert tool
      const existingTool = queryOne<ToolRow>('SELECT * FROM tools WHERE name = ?', [tool.name]);
      let toolId: string;

      if (existingTool) {
        toolId = existingTool.id;
        run('UPDATE tools SET description = ? WHERE id = ?', [tool.description ?? '', toolId]);
      } else {
        toolId = newId();
        run(
          'INSERT INTO tools (id, name, description) VALUES (?, ?, ?)',
          [toolId, tool.name, tool.description ?? '']
        );
      }

      for (const action of tool.actions) {
        // Upsert action
        const existingAction = queryOne<ToolActionRow>(
          'SELECT * FROM tool_actions WHERE tool_id = ? AND name = ?',
          [toolId, action.name]
        );
        let actionId: string;

        if (existingAction) {
          actionId = existingAction.id;
          run('UPDATE tool_actions SET description = ? WHERE id = ?', [action.description ?? '', actionId]);
        } else {
          actionId = newId();
          run(
            'INSERT INTO tool_actions (id, tool_id, name, description) VALUES (?, ?, ?, ?)',
            [actionId, toolId, action.name, action.description ?? '']
          );
        }

        for (const param of (action.params ?? [])) {
          const existingParam = queryOne<ToolActionParamRow>(
            'SELECT * FROM tool_action_params WHERE action_id = ? AND name = ?',
            [actionId, param.name]
          );

          if (existingParam) {
            run(
              `UPDATE tool_action_params
               SET type = ?, required = ?, description = ?, default_value = ?
               WHERE id = ?`,
              [
                param.type ?? 'string',
                param.required ? 1 : 0,
                param.description ?? '',
                param.default_value ?? null,
                existingParam.id,
              ]
            );
          } else {
            run(
              `INSERT INTO tool_action_params
                (id, action_id, name, type, required, description, default_value)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                newId(), actionId, param.name,
                param.type ?? 'string',
                param.required ? 1 : 0,
                param.description ?? '',
                param.default_value ?? null,
              ]
            );
          }
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function getTools(): ToolRow[] {
  return queryAll<ToolRow>('SELECT * FROM tools ORDER BY name');
}

export function getTool(name: string): ToolRow | null {
  return queryOne<ToolRow>('SELECT * FROM tools WHERE name = ?', [name]) ?? null;
}

export function getToolActions(toolName: string): ToolActionRow[] {
  return queryAll<ToolActionRow>(
    `SELECT a.*
     FROM tool_actions a
     JOIN tools t ON t.id = a.tool_id
     WHERE t.name = ?
     ORDER BY a.name`,
    [toolName]
  );
}

export function getActionParams(toolName: string, actionName: string): ToolActionParamRow[] {
  return queryAll<ToolActionParamRow>(
    `SELECT p.*
     FROM tool_action_params p
     JOIN tool_actions a ON a.id = p.action_id
     JOIN tools t ON t.id = a.tool_id
     WHERE t.name = ? AND a.name = ?
     ORDER BY p.required DESC, p.name`,
    [toolName, actionName]
  );
}

/**
 * Return structured help for a tool, optionally filtered to a single action.
 */
export function getToolHelp(toolName: string, actionName?: string): ToolHelp | null {
  const tool = getTool(toolName);
  if (!tool) return null;

  let actions = getToolActions(toolName);
  if (actionName) {
    actions = actions.filter(a => a.name === actionName);
  }

  return {
    tool,
    actions: actions.map(action => ({
      action,
      params: getActionParams(toolName, action.name),
    })),
  };
}
