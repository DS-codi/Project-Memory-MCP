/**
 * Workspace Validation - Shared validation for workspace_id on tool entry points
 *
 * Provides a reusable function that consolidated tools can call to validate
 * workspace_id before processing requests. Supports legacy ID redirect and
 * helpful error messages with suggestions.
 */

import type { ToolResponse } from '../../types/index.js';
import {
  resolveOrReject,
  findCanonicalForLegacyId,
  validateWorkspaceId,
  WorkspaceNotRegisteredError,
} from '../../storage/workspace-identity.js';

export interface ValidatedWorkspaceId {
  /** The canonical workspace ID to use (may differ from input if redirected) */
  workspace_id: string;
  /** If the input was a legacy ID, this is the original input */
  redirected_from?: string;
  /** A note to include in the response if a redirect occurred */
  redirect_note?: string;
}

/**
 * Validate a workspace_id and resolve legacy IDs to their canonical form.
 *
 * Usage in a consolidated tool:
 * ```ts
 * const validated = await validateAndResolveWorkspaceId(params.workspace_id);
 * if (!validated.success) return validated.error_response;
 * const { workspace_id } = validated;
 * ```
 */
export async function validateAndResolveWorkspaceId(
  workspaceId: string | undefined
): Promise<
  | { success: true } & ValidatedWorkspaceId
  | { success: false; error_response: ToolResponse<never> }
> {
  if (!workspaceId) {
    return {
      success: false,
      error_response: {
        success: false,
        error: 'workspace_id is required',
      },
    };
  }

  // Check direct validity
  const isValid = await validateWorkspaceId(workspaceId);
  if (isValid) {
    return { success: true, workspace_id: workspaceId };
  }

  // Check legacy ID redirect
  const canonicalId = await findCanonicalForLegacyId(workspaceId);
  if (canonicalId && canonicalId !== workspaceId) {
    const isCanonicalValid = await validateWorkspaceId(canonicalId);
    if (isCanonicalValid) {
      return {
        success: true,
        workspace_id: canonicalId,
        redirected_from: workspaceId,
        redirect_note: `Workspace ID '${workspaceId}' is a legacy ID. Redirected to canonical: '${canonicalId}'.`,
      };
    }
  }

  // Not found — generate helpful error
  try {
    await resolveOrReject(workspaceId);
    // Should not reach here (resolveOrReject would have thrown)
    return { success: true, workspace_id: workspaceId };
  } catch (err) {
    if (err instanceof WorkspaceNotRegisteredError) {
      return {
        success: false,
        error_response: {
          success: false,
          error: err.message,
        },
      };
    }
    return {
      success: false,
      error_response: {
        success: false,
        error: `Workspace '${workspaceId}' is not registered.`,
      },
    };
  }
}
