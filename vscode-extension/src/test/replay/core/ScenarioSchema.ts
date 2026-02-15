import * as fs from 'fs/promises';
import { createHash } from 'node:crypto';
import * as path from 'path';
import {
    type ReplayCheckSpec,
    type ReplayScenario,
    type ReplayScenarioStep,
    type ReplayScenarioSuite,
    type ReplayTerminalSurface
} from './types';
import { stableStringify } from './StableJson';

const SCHEMA_VERSION = '1.0';
const SCENARIO_ID_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function toObject(value: unknown, context: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${context} must be an object.`);
    }

    return value as Record<string, unknown>;
}

function toString(value: unknown, context: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${context} must be a non-empty string.`);
    }

    return value.trim();
}

function normalizeScenarioId(input: string): string {
    const normalized = input
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    if (!SCENARIO_ID_PATTERN.test(normalized)) {
        throw new Error(`scenario_id '${input}' cannot be normalized to a valid uppercase snake-case ID.`);
    }

    return normalized;
}

function normalizeTerminalSurface(input: unknown): ReplayTerminalSurface {
    if (input === 'memory_terminal' || input === 'memory_terminal_interactive' || input === 'auto') {
        return input;
    }

    return 'auto';
}

function normalizeTagToken(input: string): string {
    return input.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeTags(sourceTags: unknown, tagMetadata: Record<string, unknown> | undefined): string[] {
    const explicitTags = Array.isArray(sourceTags)
        ? sourceTags.filter((item): item is string => typeof item === 'string').map((item) => normalizeTagToken(item)).filter(Boolean)
        : [];

    const inferredTags: string[] = [];
    if (tagMetadata) {
        const domain = typeof tagMetadata.domain === 'string' ? normalizeTagToken(`domain:${tagMetadata.domain}`) : undefined;
        const surface = typeof tagMetadata.surface === 'string' ? normalizeTagToken(`surface:${tagMetadata.surface}`) : undefined;
        const risk = typeof tagMetadata.risk === 'string' ? normalizeTagToken(`risk:${tagMetadata.risk}`) : undefined;
        const priority = typeof tagMetadata.priority === 'string' ? normalizeTagToken(`priority:${tagMetadata.priority}`) : undefined;
        if (domain) {
            inferredTags.push(domain);
        }
        if (surface) {
            inferredTags.push(surface);
        }
        if (risk) {
            inferredTags.push(risk);
        }
        if (priority) {
            inferredTags.push(priority);
        }
    }

    return Array.from(new Set([...explicitTags, ...inferredTags]));
}

function toNonNegativeInt(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return undefined;
    }

    return value >= 0 ? Math.floor(value) : undefined;
}

function computeScenarioDigest(scenario: ReplayScenario): string {
    const { scenario_digest: _digest, ...rest } = scenario;
    return createHash('sha256').update(stableStringify(rest)).digest('hex');
}

function normalizeChecks(value: unknown, scenarioId: string): ReplayCheckSpec[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.map((entry, index) => {
        const check = toObject(entry, `checks[${index}]`);
        const id = toString(check.id ?? `CHECK_${index + 1}`, `checks[${index}].id`);
        const type = toString(check.type, `checks[${index}].type`);
        const severity = toString(check.severity ?? 'medium', `checks[${index}].severity`);

        if (type !== 'tool_order' && type !== 'auth_outcome' && type !== 'flow' && type !== 'success_signature') {
            throw new Error(`checks[${index}] in ${scenarioId} has unsupported type '${type}'.`);
        }

        if (severity !== 'low' && severity !== 'medium' && severity !== 'high') {
            throw new Error(`checks[${index}] in ${scenarioId} has unsupported severity '${severity}'.`);
        }

        const expectedValue = check.expected;
        const normalizedExpected =
            typeof expectedValue === 'string' || Array.isArray(expectedValue) ? expectedValue : undefined;

        return {
            id,
            type,
            severity,
            required: typeof check.required === 'boolean' ? check.required : true,
            strict_order: typeof check.strict_order === 'boolean' ? check.strict_order : undefined,
            expected: normalizedExpected,
            metadata: typeof check.metadata === 'object' && check.metadata ? (check.metadata as Record<string, unknown>) : undefined
        };
    });
}

function normalizeSteps(value: unknown, scenarioId: string): ReplayScenarioStep[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${scenarioId} must declare at least one step.`);
    }

    return value.map((entry, index) => {
        const step = toObject(entry, `${scenarioId}.steps[${index}]`);
        const kind = toString(step.kind, `${scenarioId}.steps[${index}].kind`);

        if (kind !== 'user' && kind !== 'tool' && kind !== 'wait') {
            throw new Error(`${scenarioId}.steps[${index}] has unsupported kind '${kind}'.`);
        }

        const normalized: ReplayScenarioStep = {
            kind,
            id: typeof step.id === 'string' ? step.id : `step_${index + 1}`,
            metadata: typeof step.metadata === 'object' && step.metadata ? (step.metadata as Record<string, unknown>) : undefined
        };

        if (kind === 'user') {
            normalized.prompt = toString(step.prompt, `${scenarioId}.steps[${index}].prompt`);
        }

        if (kind === 'tool') {
            normalized.tool = toString(step.tool, `${scenarioId}.steps[${index}].tool`);
            normalized.action = typeof step.action === 'string' ? step.action : 'run';
            normalized.args = typeof step.args === 'object' && step.args ? (step.args as Record<string, unknown>) : undefined;

            const auth = step.expect_auth;
            if (auth === 'allowed' || auth === 'allowed_with_warning' || auth === 'blocked') {
                normalized.expect_auth = auth;
            }
        }

        if (kind === 'wait') {
            const waitMs = typeof step.wait_ms === 'number' ? step.wait_ms : 100;
            normalized.wait_ms = waitMs > 0 ? waitMs : 100;
        }

        return normalized;
    });
}

function normalizeScenario(input: unknown, index: number): ReplayScenario {
    const source = toObject(input, `scenarios[${index}]`);
    const rawId = toString(source.scenario_id, `scenarios[${index}].scenario_id`);
    const scenarioId = normalizeScenarioId(rawId);

    const workspace = toObject(source.workspace, `${scenarioId}.workspace`);
    const runtime = toObject(source.runtime, `${scenarioId}.runtime`);
    const expectations = toObject(source.expectations, `${scenarioId}.expectations`);
    const successSignature = toObject(expectations.success_signature, `${scenarioId}.expectations.success_signature`);

    const mustInclude = Array.isArray(successSignature.must_include)
        ? successSignature.must_include.filter((item): item is string => typeof item === 'string' && item.length > 0)
        : [];

    if (mustInclude.length === 0) {
        throw new Error(`${scenarioId} must include at least one success signature.`);
    }

    const tagMetadata = typeof source.tag_metadata === 'object' && source.tag_metadata
        ? (source.tag_metadata as Record<string, unknown>)
        : undefined;
    const stabilization = typeof source.stabilization === 'object' && source.stabilization
        ? (source.stabilization as Record<string, unknown>)
        : undefined;
    const acceptanceThresholds = typeof source.acceptance_thresholds === 'object' && source.acceptance_thresholds
        ? (source.acceptance_thresholds as Record<string, unknown>)
        : undefined;

    const normalizedScenario: ReplayScenario = {
        schema_version: SCHEMA_VERSION,
        scenario_id: scenarioId,
        title: toString(source.title, `${scenarioId}.title`),
        intent: toString(source.intent, `${scenarioId}.intent`),
        driver: 'copilot-sdk',
        workspace: {
            workspace_path: toString(workspace.workspace_path, `${scenarioId}.workspace.workspace_path`),
            workspace_id: toString(workspace.workspace_id, `${scenarioId}.workspace.workspace_id`)
        },
        runtime: {
            mode: runtime.mode === 'interactive' ? 'interactive' : 'headless',
            terminal_surface: normalizeTerminalSurface(runtime.terminal_surface)
        },
        steps: normalizeSteps(source.steps, scenarioId),
        expectations: {
            success_signature: {
                must_include: mustInclude,
                allow_missing: Array.isArray(successSignature.allow_missing)
                    ? successSignature.allow_missing.filter((item): item is string => typeof item === 'string')
                    : []
            },
            checks: normalizeChecks(expectations.checks, scenarioId)
        },
        tags: normalizeTags(source.tags, tagMetadata),
        tag_metadata: tagMetadata
            ? {
                domain: typeof tagMetadata.domain === 'string' ? tagMetadata.domain.trim() : undefined,
                surface: typeof tagMetadata.surface === 'string' ? tagMetadata.surface.trim() : undefined,
                risk: tagMetadata.risk === 'p0' || tagMetadata.risk === 'p1' || tagMetadata.risk === 'p2'
                    ? tagMetadata.risk
                    : undefined,
                priority:
                    tagMetadata.priority === 'high' || tagMetadata.priority === 'medium' || tagMetadata.priority === 'low'
                        ? tagMetadata.priority
                        : undefined
            }
            : undefined,
        stabilization: stabilization
            ? {
                fixture_seed: toNonNegativeInt(stabilization.fixture_seed),
                frozen_clock_delta_ms: toNonNegativeInt(stabilization.frozen_clock_delta_ms),
                wait_budget_ms: toNonNegativeInt(stabilization.wait_budget_ms),
                resolver_fixture_tree:
                    typeof stabilization.resolver_fixture_tree === 'string'
                        ? stabilization.resolver_fixture_tree.trim()
                        : undefined
            }
            : undefined,
        acceptance_thresholds: acceptanceThresholds
            ? {
                max_total_drifts: toNonNegativeInt(acceptanceThresholds.max_total_drifts),
                max_high_severity_drifts: toNonNegativeInt(acceptanceThresholds.max_high_severity_drifts),
                max_medium_severity_drifts: toNonNegativeInt(acceptanceThresholds.max_medium_severity_drifts),
                max_low_severity_drifts: toNonNegativeInt(acceptanceThresholds.max_low_severity_drifts)
            }
            : undefined,
        source_refs: Array.isArray(source.source_refs)
            ? source.source_refs.filter((item): item is string => typeof item === 'string')
            : [],
        determinism:
            source.determinism === 'strict' || source.determinism === 'moderate' || source.determinism === 'loose'
                ? source.determinism
                : 'strict',
        timeouts: typeof source.timeouts === 'object' && source.timeouts
            ? {
                run_timeout_ms: typeof (source.timeouts as Record<string, unknown>).run_timeout_ms === 'number'
                    ? (source.timeouts as Record<string, unknown>).run_timeout_ms as number
                    : undefined,
                step_timeout_ms: typeof (source.timeouts as Record<string, unknown>).step_timeout_ms === 'number'
                    ? (source.timeouts as Record<string, unknown>).step_timeout_ms as number
                    : undefined
            }
            : undefined,
        normalization: typeof source.normalization === 'object' && source.normalization
            ? {
                mask_ids: Boolean((source.normalization as Record<string, unknown>).mask_ids),
                canonicalize_timestamps: Boolean((source.normalization as Record<string, unknown>).canonicalize_timestamps),
                canonicalize_paths: Boolean((source.normalization as Record<string, unknown>).canonicalize_paths),
                strip_nondeterministic_text: Boolean(
                    (source.normalization as Record<string, unknown>).strip_nondeterministic_text
                )
            }
            : undefined,
        metadata: typeof source.metadata === 'object' && source.metadata ? (source.metadata as Record<string, unknown>) : undefined
    };

    const waitBudget = normalizedScenario.stabilization?.wait_budget_ms;
    if (typeof waitBudget === 'number' && waitBudget > 0) {
        normalizedScenario.steps = normalizedScenario.steps.map((step) => {
            if (step.kind !== 'wait') {
                return step;
            }
            const waitMs = step.wait_ms ?? 100;
            return {
                ...step,
                wait_ms: Math.min(waitMs, waitBudget)
            };
        });
    }

    normalizedScenario.scenario_digest = computeScenarioDigest(normalizedScenario);
    return normalizedScenario;
}

export function parseScenarioSuite(input: unknown): ReplayScenarioSuite {
    const source = toObject(input, 'scenario suite');
    const rawScenarios = source.scenarios;

    if (!Array.isArray(rawScenarios)) {
        throw new Error('scenario suite must include a scenarios array.');
    }

    const scenarios = rawScenarios.map((entry, index) => normalizeScenario(entry, index));
    const duplicateIds = new Set<string>();
    const seen = new Set<string>();

    for (const scenario of scenarios) {
        if (seen.has(scenario.scenario_id)) {
            duplicateIds.add(scenario.scenario_id);
        }
        seen.add(scenario.scenario_id);
    }

    if (duplicateIds.size > 0) {
        throw new Error(`duplicate scenario_id values found: ${Array.from(duplicateIds).join(', ')}`);
    }

    return {
        schema_version: SCHEMA_VERSION,
        scenarios
    };
}

export async function loadScenarioSuite(scenariosPath: string): Promise<ReplayScenarioSuite> {
    const absolutePath = path.resolve(scenariosPath);
    const raw = await fs.readFile(absolutePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    return parseScenarioSuite(parsed);
}
