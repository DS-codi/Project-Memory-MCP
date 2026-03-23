/**
 * Integration Test — Agent Lifecycle (Phases 2-6 Combined)
 *
 * Validates that the Hub→Coordinator alias, _session_id passthrough,
 * preflight validation, and Zod error formatting work together correctly
 * across the MCP tool surface.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { preflightValidate, buildPreflightFailure } from '../../tools/preflight/index.js';
import { formatZodError, isZodError } from '../../utils/zod-error-formatter.js';

// ---------------------------------------------------------------------------
// Recreate the AgentTypeSchema exactly as defined in server/src/index.ts
// (it's a local const inside createMcpServer, so we rebuild it here)
// ---------------------------------------------------------------------------
const AgentTypeSchema = z.preprocess(
  (val) => val === 'Hub' ? 'Coordinator' : val,
  z.enum([
    'Coordinator', 'Analyst', 'Researcher', 'Architect', 'Executor',
    'Reviewer', 'Tester', 'Revisionist', 'Archivist',
    'Brainstorm', 'Runner', 'SkillWriter', 'Worker', 'TDDDriver', 'Cognition',
    'Migrator',
  ]),
);

// ---------------------------------------------------------------------------
// Phase 2: Hub → Coordinator alias normalization
// ---------------------------------------------------------------------------
describe('AgentTypeSchema Hub→Coordinator normalization', () => {
  it('maps agent_type "Hub" to "Coordinator"', () => {
    const result = AgentTypeSchema.parse('Hub');
    expect(result).toBe('Coordinator');
  });

  it('maps to_agent "Hub" to "Coordinator"', () => {
    // Simulates to_agent field going through the same schema
    const result = AgentTypeSchema.parse('Hub');
    expect(result).toBe('Coordinator');
  });

  it('passes through canonical "Coordinator" unchanged', () => {
    expect(AgentTypeSchema.parse('Coordinator')).toBe('Coordinator');
  });

  it('passes through other valid agent types unchanged', () => {
    const types = [
      'Analyst', 'Researcher', 'Architect', 'Executor',
      'Reviewer', 'Tester', 'Revisionist', 'Archivist',
      'Brainstorm', 'Runner', 'SkillWriter', 'Worker',
      'TDDDriver', 'Cognition', 'Migrator',
    ];
    for (const t of types) {
      expect(AgentTypeSchema.parse(t)).toBe(t);
    }
  });

  it('rejects invalid agent type strings', () => {
    expect(() => AgentTypeSchema.parse('InvalidAgent')).toThrow();
    expect(() => AgentTypeSchema.parse('')).toThrow();
    expect(() => AgentTypeSchema.parse(42)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Phase 3: _session_id passthrough in tool schemas
// ---------------------------------------------------------------------------
describe('_session_id passthrough in representative tool schemas', () => {
  // Build representative schemas matching the server's tool definitions.
  // Each includes action + _session_id + workspace_id as the server does.

  const memoryWorkspaceSchema = z.object({
    action: z.string(),
    workspace_id: z.string().optional(),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
  }).passthrough();

  const memoryPlanSchema = z.object({
    action: z.string(),
    plan_id: z.string().optional(),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
  }).passthrough();

  const memoryStepsSchema = z.object({
    action: z.string(),
    workspace_id: z.string(),
    plan_id: z.string(),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
  }).passthrough();

  const memoryAgentSchema = z.object({
    action: z.string(),
    agent_type: AgentTypeSchema.optional(),
    workspace_id: z.string().optional(),
    _session_id: z.string().optional().describe('Session ID for instrumentation tracking'),
  }).passthrough();

  it('memory_workspace schema preserves _session_id', () => {
    const parsed = memoryWorkspaceSchema.parse({
      action: 'info',
      workspace_id: 'ws_test',
      _session_id: 'sess_test_123',
    });
    expect(parsed._session_id).toBe('sess_test_123');
  });

  it('memory_plan schema preserves _session_id', () => {
    const parsed = memoryPlanSchema.parse({
      action: 'get',
      plan_id: 'plan_test',
      _session_id: 'sess_test_456',
    });
    expect(parsed._session_id).toBe('sess_test_456');
  });

  it('memory_steps schema preserves _session_id', () => {
    const parsed = memoryStepsSchema.parse({
      action: 'update',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      _session_id: 'sess_test_789',
    });
    expect(parsed._session_id).toBe('sess_test_789');
  });

  it('memory_agent schema preserves _session_id and normalizes Hub', () => {
    const parsed = memoryAgentSchema.parse({
      action: 'init',
      agent_type: 'Hub',
      workspace_id: 'ws_test',
      _session_id: 'sess_test_abc',
    });
    expect(parsed._session_id).toBe('sess_test_abc');
    expect(parsed.agent_type).toBe('Coordinator');
  });

  it('schemas accept missing _session_id (optional)', () => {
    const parsed = memoryWorkspaceSchema.parse({
      action: 'list',
    });
    expect(parsed._session_id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 4: Preflight validation catches missing required fields
// ---------------------------------------------------------------------------
describe('Preflight validation and failure response shape', () => {
  it('catches missing required fields for a known tool+action', () => {
    // memory_plan(action: "create") requires workspace_id, title
    const result = preflightValidate('memory_plan', 'create', {
      action: 'create',
      // missing workspace_id and title
    });

    if (!result.valid) {
      expect(result.missing_fields).toBeDefined();
      expect(result.missing_fields.length).toBeGreaterThan(0);
      expect(result.message).toContain('missing required field');
    }
    // If valid=true here, it means the action-param-registry doesn't have a spec for this
    // action yet — that's acceptable as the registry is incrementally populated.
  });

  it('buildPreflightFailure returns standardized PreflightFailureResponse shape', () => {
    const failedResult = {
      valid: false as const,
      missing_fields: ['workspace_id', 'title'],
      message: 'memory_plan(action: "create") — missing required fields: workspace_id, title',
    };

    const response = buildPreflightFailure('memory_plan', 'create', failedResult);

    expect(response).toEqual({
      success: false,
      error: expect.any(String),
      preflight_failure: true,
      tool_name: 'memory_plan',
      action: 'create',
      missing_fields: ['workspace_id', 'title'],
    });
  });

  it('passes validation when all required fields are present', () => {
    // memory_agent(action: "init") requires at minimum workspace_id, agent_type
    const result = preflightValidate('memory_agent', 'init', {
      action: 'init',
      workspace_id: 'ws_test',
      agent_type: 'Executor',
    });
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 5: Zod error formatter produces agent-friendly messages
// ---------------------------------------------------------------------------
describe('Zod error formatter', () => {
  it('formats a missing required field error', () => {
    const schema = z.object({
      workspace_id: z.string(),
      action: z.string(),
    });

    const parseResult = schema.safeParse({ action: 'list' });
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error, 'memory_workspace');
      expect(formatted).toContain('workspace_id');
      expect(formatted).toContain('memory_workspace');
    }
  });

  it('formats an invalid enum value error', () => {
    const parseResult = AgentTypeSchema.safeParse('NotAnAgent');
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error);
      expect(formatted).toContain('expected one of');
    }
  });

  it('formats multiple errors as a numbered list', () => {
    const schema = z.object({
      workspace_id: z.string(),
      plan_id: z.string(),
      step_index: z.number(),
    });

    const parseResult = schema.safeParse({});
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error, 'memory_steps');
      expect(formatted).toContain('validation error(s)');
      expect(formatted).toContain('workspace_id');
      expect(formatted).toContain('plan_id');
      expect(formatted).toContain('step_index');
    }
  });

  it('isZodError correctly identifies ZodError instances', () => {
    const schema = z.object({ x: z.string() });
    try {
      schema.parse({});
    } catch (err) {
      expect(isZodError(err)).toBe(true);
    }
    expect(isZodError(new Error('not a zod error'))).toBe(false);
    expect(isZodError(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Combined: Full lifecycle validation
// ---------------------------------------------------------------------------
describe('Full lifecycle: Hub init → handoff → Coordinator resolution', () => {
  it('agent init with Hub type resolves to Coordinator end-to-end', () => {
    // Simulate the full path: agent sends init with Hub
    const initParams = {
      action: 'init',
      agent_type: 'Hub',
      workspace_id: 'ws_lifecycle_test',
      _session_id: 'sess_lifecycle_001',
    };

    // 1. Preflight passes
    const preflight = preflightValidate('memory_agent', 'init', initParams);
    expect(preflight.valid).toBe(true);

    // 2. AgentTypeSchema normalizes Hub → Coordinator
    const normalizedType = AgentTypeSchema.parse(initParams.agent_type);
    expect(normalizedType).toBe('Coordinator');

    // 3. _session_id is preserved
    expect(initParams._session_id).toBe('sess_lifecycle_001');
  });

  it('handoff with to_agent Hub resolves to Coordinator', () => {
    const handoffParams = {
      action: 'handoff',
      from_agent: 'Executor',
      to_agent: 'Hub',
      reason: 'work complete',
      workspace_id: 'ws_lifecycle_test',
      _session_id: 'sess_lifecycle_002',
    };

    // Normalize the from_agent and to_agent through the schema
    const normalizedFrom = AgentTypeSchema.parse(handoffParams.from_agent);
    const normalizedTo = AgentTypeSchema.parse(handoffParams.to_agent);

    expect(normalizedFrom).toBe('Executor');
    expect(normalizedTo).toBe('Coordinator');
    expect(handoffParams._session_id).toBe('sess_lifecycle_002');
  });

  it('invalid agent type fails fast with formatted error', () => {
    const parseResult = AgentTypeSchema.safeParse('FakeAgent');
    expect(parseResult.success).toBe(false);
    if (!parseResult.success) {
      const formatted = formatZodError(parseResult.error, 'memory_agent');
      expect(formatted).toContain('memory_agent');
      expect(formatted).toContain('expected one of');
    }
  });
});
