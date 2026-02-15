import * as path from 'path';
import { type ReplayTraceEvent } from './types';

export interface NormalizeTraceOptions {
    workspacePath?: string;
    maskIds?: boolean;
    canonicalizeTimestamps?: boolean;
    canonicalizePaths?: boolean;
    stripNondeterministicText?: boolean;
}

const VOLATILE_ID_PATTERNS: RegExp[] = [
    /\b(sess|run|req)_[A-Za-z0-9_-]+\b/g,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    /\b[0-9A-HJKMNP-TV-Z]{26}\b/g
];

const NON_DETERMINISTIC_TEXT_PATTERNS: RegExp[] = [
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g,
    /\b\d{10,}\b/g
];

const ACTION_ALIAS_MAP: Record<string, string> = {
    run: 'execute',
    send: 'execute',
    create: 'execute',
    kill: 'terminate',
    close: 'terminate'
};

const WINDOWS_ABSOLUTE_PATH_PATTERN = /[A-Za-z]:\\[^\s"']+/g;
const POSIX_ABSOLUTE_PATH_PATTERN = /(^|[\s"'(=])(\/[\w.\-/]+)/g;

function toForwardSlashPath(value: string): string {
    return value.replace(/\\/g, '/');
}

function canonicalizeAbsolutePath(value: string, workspacePath?: string): string {
    const normalizedValue = toForwardSlashPath(value);
    if (!workspacePath) {
        return normalizedValue;
    }

    const workspaceCandidates = new Set<string>();
    const workspaceRaw = toForwardSlashPath(workspacePath).replace(/\/+$/, '');
    const workspaceResolved = toForwardSlashPath(path.resolve(workspacePath)).replace(/\/+$/, '');

    if (workspaceRaw.length > 0) {
        workspaceCandidates.add(workspaceRaw);
        workspaceCandidates.add(workspaceRaw.toLowerCase());
    }

    if (workspaceResolved.length > 0) {
        workspaceCandidates.add(workspaceResolved);
        workspaceCandidates.add(workspaceResolved.toLowerCase());
    }

    for (const candidate of workspaceCandidates) {
        if (candidate.length === 0) {
            continue;
        }

        const normalizedCandidate = candidate.replace(/\/+$/, '');
        const candidateIsMatch = normalizedValue.toLowerCase().startsWith(`${normalizedCandidate.toLowerCase()}/`);
        const candidateIsSelf = normalizedValue.toLowerCase() === normalizedCandidate.toLowerCase();

        if (candidateIsMatch || candidateIsSelf) {
            const relative = normalizedValue.slice(normalizedCandidate.length).replace(/^\//, '');
            return relative.length > 0 ? relative : '.';
        }
    }

    return normalizedValue;
}

function canonicalizePathTokens(input: string, workspacePath?: string): string {
    const windowsNormalized = input.replace(WINDOWS_ABSOLUTE_PATH_PATTERN, (match) =>
        canonicalizeAbsolutePath(match, workspacePath)
    );

    return windowsNormalized.replace(POSIX_ABSOLUTE_PATH_PATTERN, (match, prefix: string, absolutePath: string) => {
        const normalizedPath = canonicalizeAbsolutePath(absolutePath, workspacePath);
        return `${prefix}${normalizedPath}`;
    });
}

function canonicalizeAction(rawAction: string | undefined): string | undefined {
    if (!rawAction) {
        return undefined;
    }

    const normalized = rawAction.trim().toLowerCase();
    return ACTION_ALIAS_MAP[normalized] ?? normalized;
}

function normalizeStringValue(
    input: string,
    options: Required<Pick<NormalizeTraceOptions, 'maskIds' | 'canonicalizePaths' | 'stripNondeterministicText'>>,
    workspacePath?: string
): string {
    let value = input;

    if (options.maskIds) {
        for (const pattern of VOLATILE_ID_PATTERNS) {
            value = value.replace(pattern, '<ID>');
        }
    }

    if (options.canonicalizePaths) {
        value = canonicalizePathTokens(value, workspacePath);
    }

    if (options.stripNondeterministicText) {
        for (const pattern of NON_DETERMINISTIC_TEXT_PATTERNS) {
            value = value.replace(pattern, '<NONDET>');
        }
    }

    return value;
}

function normalizeUnknown(
    value: unknown,
    options: Required<Pick<NormalizeTraceOptions, 'maskIds' | 'canonicalizePaths' | 'stripNondeterministicText'>>,
    workspacePath?: string
): unknown {
    if (typeof value === 'string') {
        return normalizeStringValue(value, options, workspacePath);
    }

    if (Array.isArray(value)) {
        return value.map((entry) => normalizeUnknown(entry, options, workspacePath));
    }

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const normalizedEntries = Object.entries(record).map(([key, entry]) => [
            key,
            normalizeUnknown(entry, options, workspacePath)
        ]);
        return Object.fromEntries(normalizedEntries);
    }

    return value;
}

export function normalizeTraceEvents(events: ReplayTraceEvent[], options: NormalizeTraceOptions = {}): ReplayTraceEvent[] {
    const baseTimestamp = events.length > 0 ? events[0].timestamp_ms : 0;
    const effective = {
        maskIds: options.maskIds ?? true,
        canonicalizeTimestamps: options.canonicalizeTimestamps ?? true,
        canonicalizePaths: options.canonicalizePaths ?? true,
        stripNondeterministicText: options.stripNondeterministicText ?? true
    };

    return events.map((event) => {
        const normalizedTimestamp = effective.canonicalizeTimestamps
            ? Math.max(0, event.timestamp_ms - baseTimestamp)
            : event.timestamp_ms;

        const actionCanonical = canonicalizeAction(event.action_raw) ?? event.action_canonical;

        const payload = event.payload
            ? (normalizeUnknown(
                event.payload,
                {
                    maskIds: effective.maskIds,
                    canonicalizePaths: effective.canonicalizePaths,
                    stripNondeterministicText: effective.stripNondeterministicText
                },
                options.workspacePath
            ) as Record<string, unknown>)
            : undefined;

        return {
            ...event,
            timestamp_ms: normalizedTimestamp,
            action_canonical: actionCanonical,
            tool_name: event.tool_name ? event.tool_name.trim() : event.tool_name,
            payload
        };
    });
}

export interface ReplayTraceProjection {
    scenario_id: string;
    event_type: string;
    action?: string;
    tool?: string;
    auth_outcome?: string;
    phase?: string;
    success_signature?: string;
}

export function projectTraceForComparison(events: ReplayTraceEvent[]): ReplayTraceProjection[] {
    return events.map((event) => ({
        scenario_id: event.scenario_id,
        event_type: event.event_type,
        action: event.action_canonical ?? event.action_raw,
        tool: event.tool_name,
        auth_outcome: event.authorization?.outcome,
        phase: event.phase,
        success_signature: event.success_signature
    }));
}
