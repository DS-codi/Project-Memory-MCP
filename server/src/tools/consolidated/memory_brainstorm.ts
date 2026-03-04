/**
 * memory_brainstorm — Consolidated MCP tool for Brainstorm GUI routing
 *
 * Wraps the brainstorm-routing.ts orchestration layer so the Coordinator and
 * other hub agents can drive the brainstorm → GUI → Architect flow via a
 * single MCP tool rather than calling the internal routing functions directly.
 *
 * Actions:
 *   route              — Send a FormRequest to the GUI (no fallback).
 *                        Calls routeBrainstormToGui().
 *   route_with_fallback — Send a FormRequest to the GUI; auto-fills answers
 *                        when GUI is unavailable.
 *                        Calls routeBrainstormWithFallback().
 *   refine             — Submit a standalone refinement request to the active
 *                        Brainstorm agent via the Supervisor.
 *                        Calls routeRefinementRequest().
 */

import type { FormRequest, FormRefinementRequest } from '../../types/gui-forms.types.js';
import {
  routeBrainstormToGui,
  routeBrainstormWithFallback,
  routeRefinementRequest,
} from '../orchestration/brainstorm-routing.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BrainstormAction = 'route' | 'route_with_fallback' | 'refine';

export interface MemoryBrainstormParams {
  action: BrainstormAction;
  /** Required for action: route | route_with_fallback */
  form_request?: Record<string, unknown>;
  /** Required for action: refine */
  refinement_request?: Record<string, unknown>;
}

export interface MemoryBrainstormResult {
  success: boolean;
  action: BrainstormAction;
  data?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function memoryBrainstorm(
  params: MemoryBrainstormParams
): Promise<MemoryBrainstormResult> {
  const { action } = params;

  try {
    switch (action) {
      case 'route': {
        if (!params.form_request) {
          return {
            success: false,
            action,
            error: 'form_request is required for action: route',
          };
        }

        const result = await routeBrainstormToGui(
          params.form_request as unknown as FormRequest
        );

        return {
          success: result.success,
          action,
          data: result,
          ...(result.success ? {} : { error: result.error ?? 'GUI routing failed' }),
        };
      }

      case 'route_with_fallback': {
        if (!params.form_request) {
          return {
            success: false,
            action,
            error: 'form_request is required for action: route_with_fallback',
          };
        }

        const result = await routeBrainstormWithFallback(
          params.form_request as unknown as FormRequest
        );

        // When the GUI was never reached, the answers are auto-filled placeholders —
        // not real human decisions.  Force the agent to pause and get explicit human
        // approval via VS Code's native terminal-approval dialog before proceeding.
        if (result.path === 'fallback') {
          return {
            success: false,
            action,
            data: {
              ...result,
              requires_approval: true,
              approval_required_reason:
                result.error ?? 'GUI was unavailable; answers shown below are auto-filled placeholders, not real human decisions.',
              approval_instructions:
                'STOP. The brainstorm GUI did not return live user answers.\n' +
                'Auto-filled placeholder answers are included in this response but MUST NOT be used to drive plan decisions without human review.\n' +
                '\n' +
                'REQUIRED NEXT STEP:\n' +
                '  Call memory_terminal(action: "run", command: "echo", args: ["brainstorm-approval-check"]) immediately.\n' +
                '  This command is not on the auto-approve allowlist and will surface VS Code\'s native approval dialog.\n' +
                '  The human reviewer will see the dialog, review the brainstorm context, and decide whether to approve.\n' +
                '\n' +
                'AFTER APPROVAL:\n' +
                '  If the human approved → you may proceed using the fallback answers in this response.\n' +
                '  If the GUI is now available → call memory_brainstorm(action: "route_with_fallback") again to get live answers before proceeding.',
            },
            error:
              'Brainstorm GUI did not return live answers — human approval required before continuing. ' +
              'See approval_instructions in data field.',
          };
        }

        return {
          success: result.success,
          action,
          data: result,
          ...(result.success ? {} : { error: result.error ?? 'Brainstorm routing failed' }),
        };
      }

      case 'refine': {
        if (!params.refinement_request) {
          return {
            success: false,
            action,
            error: 'refinement_request is required for action: refine',
          };
        }

        const result = await routeRefinementRequest(
          params.refinement_request as unknown as FormRefinementRequest
        );

        return {
          success: result.success,
          action,
          data: result,
          ...(result.success ? {} : { error: result.error ?? 'Refinement routing failed' }),
        };
      }

      default: {
        const exhaustiveCheck: never = action;
        return {
          success: false,
          action: exhaustiveCheck,
          error: `Unknown action: ${String(exhaustiveCheck)}`,
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      action,
      error: `memory_brainstorm error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
