import { normalizeTraceEvents } from './Normalize';
import {
    type ReplayProfileArtifacts,
    type ReplayProfileName,
    type ReplayRawTraceEventEnvelope,
    type ReplayScenario,
    type ReplayScenarioRunArtifact,
    type ReplayTraceEvent
} from './types';

export interface TraceCaptureContext {
    profile: ReplayProfileName;
    run_id: string;
}

export type TraceScenarioRunner = (
    scenario: ReplayScenario,
    context: TraceCaptureContext
) => Promise<ReplayTraceEvent[]>;

export interface CaptureScenarioOptions {
    workspacePath?: string;
}

export async function captureScenarioArtifact(
    scenario: ReplayScenario,
    context: TraceCaptureContext,
    runner: TraceScenarioRunner,
    options: CaptureScenarioOptions = {}
): Promise<ReplayScenarioRunArtifact> {
    const rawEvents = await runner(scenario, context);
    const normalizedEvents = normalizeTraceEvents(rawEvents, {
        workspacePath: options.workspacePath,
        maskIds: scenario.normalization?.mask_ids,
        canonicalizeTimestamps: scenario.normalization?.canonicalize_timestamps,
        canonicalizePaths: scenario.normalization?.canonicalize_paths,
        stripNondeterministicText: scenario.normalization?.strip_nondeterministic_text
    });

    return {
        scenario_id: scenario.scenario_id,
        profile: context.profile,
        raw_events: rawEvents,
        normalized_events: normalizedEvents,
        success: normalizedEvents.some((event) => event.event_type === 'outcome')
    };
}

export function createRawTraceEventEnvelopes(
    runId: string,
    profileArtifacts: ReplayProfileArtifacts
): ReplayRawTraceEventEnvelope[] {
    const envelopes: ReplayRawTraceEventEnvelope[] = [];

    for (const scenario of profileArtifacts.scenarios) {
        for (const event of scenario.raw_events) {
            envelopes.push({
                run_id: runId,
                profile: profileArtifacts.profile,
                scenario_id: scenario.scenario_id,
                event
            });
        }
    }

    return envelopes;
}
