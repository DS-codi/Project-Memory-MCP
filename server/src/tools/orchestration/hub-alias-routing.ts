/**
 * Canonical Hub compatibility alias routing.
 *
 * Legacy hub labels are resolved to canonical Hub modes while preserving
 * backward compatibility during the fixed deprecation window.
 */

export type CanonicalHubMode =
  | 'standard_orchestration'
  | 'investigation'
  | 'adhoc_runner'
  | 'tdd_cycle';

export type LegacyHubLabel = 'Coordinator' | 'Analyst' | 'Runner' | 'TDDDriver';

export interface HubAliasResolution {
  requested_hub_label: LegacyHubLabel | 'Hub' | null;
  resolved_mode: CanonicalHubMode | null;
  alias_resolution_applied: boolean;
  deprecation_phase: string;
}

export const LEGACY_HUB_ALIAS_MAP: Record<LegacyHubLabel, CanonicalHubMode> = {
  Coordinator: 'standard_orchestration',
  Analyst: 'investigation',
  Runner: 'adhoc_runner',
  TDDDriver: 'tdd_cycle',
};

function deprecationPhase(): string {
  const raw = process.env.PM_HUB_ALIAS_DEPRECATION_PHASE?.trim();
  if (!raw) return 'phase_1_warn';
  return raw;
}

export function resolveHubAliasRouting(
  agentName: string,
  explicitMode?: CanonicalHubMode,
): HubAliasResolution {
  if (agentName in LEGACY_HUB_ALIAS_MAP) {
    const label = agentName as LegacyHubLabel;
    return {
      requested_hub_label: label,
      resolved_mode: LEGACY_HUB_ALIAS_MAP[label],
      alias_resolution_applied: true,
      deprecation_phase: deprecationPhase(),
    };
  }

  if (agentName === 'Hub') {
    return {
      requested_hub_label: 'Hub',
      resolved_mode: explicitMode ?? 'standard_orchestration',
      alias_resolution_applied: false,
      deprecation_phase: deprecationPhase(),
    };
  }

  return {
    requested_hub_label: null,
    resolved_mode: null,
    alias_resolution_applied: false,
    deprecation_phase: deprecationPhase(),
  };
}
