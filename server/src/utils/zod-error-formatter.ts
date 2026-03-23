/**
 * Zod Error Formatter
 *
 * Transforms raw ZodError objects into agent-friendly error messages.
 * Used by withLogging to format Zod validation errors that escape handlers,
 * and available as a shared utility for any code that does manual Zod parsing.
 *
 * NOTE: The MCP SDK validates tool input schemas BEFORE handlers are called
 * (via safeParseAsync in mcp.js). SDK-level Zod errors produce their own
 * format (`Input validation error: Invalid arguments for tool <name>: <msg>`)
 * and only include the first issue. This formatter covers Zod errors that
 * originate within handler code or downstream validation.
 *
 * @module utils/zod-error-formatter
 */

import { ZodError, type ZodIssue } from 'zod';

/**
 * Format a single ZodIssue into a human-readable string.
 */
function formatIssue(issue: ZodIssue): string {
  const fieldPath = issue.path.length > 0
    ? issue.path.join('.')
    : '<root>';

  switch (issue.code) {
    case 'invalid_type':
      return `Field '${fieldPath}': expected ${issue.expected}, received ${issue.received}`;

    case 'invalid_enum_value':
      return `Field '${fieldPath}': expected one of [${issue.options.join(', ')}], received '${(issue as ZodIssue & { received: unknown }).received}'`;

    case 'invalid_literal':
      return `Field '${fieldPath}': expected literal ${JSON.stringify(issue.expected)}, received ${JSON.stringify((issue as ZodIssue & { received: unknown }).received)}`;

    case 'invalid_union':
      return `Field '${fieldPath}': value does not match any of the expected types`;

    case 'too_small':
      return `Field '${fieldPath}': value is too small (minimum: ${issue.minimum})`;

    case 'too_big':
      return `Field '${fieldPath}': value is too large (maximum: ${issue.maximum})`;

    case 'invalid_string':
      return `Field '${fieldPath}': invalid string (${issue.validation})`;

    case 'unrecognized_keys':
      return `Unrecognized keys: [${issue.keys.join(', ')}]`;

    default:
      return `Field '${fieldPath}': ${issue.message}`;
  }
}

/**
 * Format a ZodError into an agent-friendly multi-line message.
 *
 * @param error - The ZodError to format
 * @param context - Optional context string (e.g., tool name) prepended to the message
 * @returns A formatted error string with one line per issue
 */
export function formatZodError(error: ZodError, context?: string): string {
  const issueLines = error.issues.map(formatIssue);
  const prefix = context ? `${context}: ` : '';
  if (issueLines.length === 1) {
    return `${prefix}${issueLines[0]}`;
  }
  return `${prefix}${issueLines.length} validation error(s):\n  - ${issueLines.join('\n  - ')}`;
}

/**
 * Check if an unknown error is a ZodError.
 */
export function isZodError(error: unknown): error is ZodError {
  return error instanceof ZodError;
}
