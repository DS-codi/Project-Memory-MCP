/**
 * memory_instructions — MCP tool for reading and searching instruction files.
 *
 * Enables agents to dynamically discover and pull only the context they need
 * from instruction files stored in the DB, instead of pre-loading everything.
 *
 * Actions:
 *   search        — LIKE keyword search; returns section_matches per file (no full content)
 *   get           — full content of one instruction by filename
 *   get_section   — extract a specific ## or ### section by heading (partial match)
 *   list          — metadata only, no content
 *   list_workspace — workspace-assigned instructions, metadata only
 */

import {
  listInstructions,
  getInstruction,
  searchInstructions,
  extractMatchingSections,
  getInstructionSection,
  listWorkspaceInstructionAssignments,
} from '../../db/instruction-db.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InstructionsAction = 'search' | 'get' | 'get_section' | 'list' | 'list_workspace';

export interface MemoryInstructionsParams {
  action:        InstructionsAction;
  query?:        string;
  filename?:     string;
  heading?:      string;
  workspace_id?: string;
}

export type MemoryInstructionsResponse =
  | { success: true;  data: unknown }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function memoryInstructions(
  params: MemoryInstructionsParams
): Promise<MemoryInstructionsResponse> {
  const { action } = params;

  try {
    switch (action) {

      // ---- list ---------------------------------------------------------------
      case 'list': {
        const rows = listInstructions();
        return {
          success: true,
          data: rows.map(r => ({
            filename:   r.filename,
            applies_to: r.applies_to,
            updated_at: r.updated_at,
          })),
        };
      }

      // ---- list_workspace -----------------------------------------------------
      case 'list_workspace': {
        const { workspace_id } = params;
        if (!workspace_id) {
          return { success: false, error: 'workspace_id is required for list_workspace' };
        }
        const assignments = listWorkspaceInstructionAssignments(workspace_id);
        const data = assignments.map(a => {
          const row = getInstruction(a.filename);
          return {
            filename:         a.filename,
            applies_to:       row?.applies_to ?? '',
            assignment_notes: a.notes ?? null,
            updated_at:       row?.updated_at ?? a.assigned_at,
          };
        });
        return { success: true, data };
      }

      // ---- search -------------------------------------------------------------
      case 'search': {
        const { query } = params;
        if (!query) {
          return { success: false, error: 'query is required for search' };
        }
        const rows = searchInstructions(query);
        const data = rows.map(r => ({
          filename:        r.filename,
          applies_to:      r.applies_to,
          section_matches: extractMatchingSections(r.content, query),
        }));
        return { success: true, data };
      }

      // ---- get ----------------------------------------------------------------
      case 'get': {
        const { filename } = params;
        if (!filename) {
          return { success: false, error: 'filename is required for get' };
        }
        const row = getInstruction(filename);
        if (!row) {
          return { success: false, error: `Instruction file not found: ${filename}` };
        }
        return {
          success: true,
          data: {
            filename:   row.filename,
            applies_to: row.applies_to,
            content:    row.content,
            updated_at: row.updated_at,
          },
        };
      }

      // ---- get_section --------------------------------------------------------
      case 'get_section': {
        const { filename, heading } = params;
        if (!filename) {
          return { success: false, error: 'filename is required for get_section' };
        }
        if (!heading) {
          return { success: false, error: 'heading is required for get_section' };
        }
        const section = getInstructionSection(filename, heading);
        if (!section) {
          // Check if the file itself is missing for a clearer error message
          const row = getInstruction(filename);
          if (!row) {
            return { success: false, error: `Instruction file not found: ${filename}` };
          }
          return { success: false, error: `Section "${heading}" not found in ${filename}` };
        }
        return { success: true, data: section };
      }

      default: {
        const _exhaustive: never = action;
        return { success: false, error: `Unknown action: ${String(_exhaustive)}` };
      }
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
