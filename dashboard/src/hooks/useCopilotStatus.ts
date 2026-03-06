import { useQuery } from '@tanstack/react-query';
import { CopilotStatus } from '@/types';
import { API_BASE_URL } from '@/config';

interface CopilotStatusResponse {
  status: CopilotStatus;
}

interface RuntimeFallbackHealthResponse {
  fallback_api?: {
    state?: string;
    detail?: string;
    checked_at?: string;
  };
}

interface AgentDeploymentRecord {
  workspace_id?: string;
  sync_status?: string;
}

interface AgentRecord {
  agent_id?: string;
  deployments?: AgentDeploymentRecord[];
}

interface AgentsResponse {
  agents?: AgentRecord[];
}

interface PromptsResponse {
  prompts?: unknown[];
}

interface InstructionsResponse {
  instructions?: unknown[];
}

type FallbackApiHealthState = CopilotStatus['fallbackApiHealth'];

interface FallbackHealthSummary {
  state: FallbackApiHealthState;
  detail?: string;
  checkedAt?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFallbackHealthState(value: unknown): value is FallbackApiHealthState {
  return value === 'healthy' || value === 'degraded' || value === 'disabled' || value === 'unknown';
}

function normalizeFallbackHealth(payload: unknown): FallbackHealthSummary {
  if (!isObject(payload)) {
    return {
      state: 'unknown',
      detail: 'Fallback API health unavailable',
    };
  }

  const fallbackApi = isObject(payload.fallback_api) ? payload.fallback_api : null;
  const stateCandidate = fallbackApi?.state;
  const detailCandidate = fallbackApi?.detail;
  const checkedAtCandidate = fallbackApi?.checked_at;

  return {
    state: isFallbackHealthState(stateCandidate) ? stateCandidate : 'unknown',
    detail: typeof detailCandidate === 'string' ? detailCandidate : undefined,
    checkedAt: typeof checkedAtCandidate === 'string' ? checkedAtCandidate : undefined,
  };
}

function defaultFallbackHealth(): FallbackHealthSummary {
  return {
    state: 'unknown',
    detail: 'Fallback API health unavailable',
  };
}

async function parseJsonOrDefault<T>(response: Response, fallback: T): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

// Fetch Copilot status for a workspace
export async function fetchCopilotStatus(workspaceId: string): Promise<CopilotStatusResponse> {
  // Fetch agents, prompts, and instructions status in parallel
  const [agentsRes, promptsRes, instructionsRes, fallbackHealthRes] = await Promise.all([
    fetch(`${API_BASE_URL}/api/agents`),
    fetch(`${API_BASE_URL}/api/prompts`),
    fetch(`${API_BASE_URL}/api/instructions/workspace/${workspaceId}`),
    fetch(`${API_BASE_URL}/api/runtime/fallback-health`),
  ]);

  // Parse responses
  const agents = agentsRes.ok
    ? await parseJsonOrDefault<AgentsResponse>(agentsRes, { agents: [] })
    : { agents: [] };
  const prompts = promptsRes.ok
    ? await parseJsonOrDefault<PromptsResponse>(promptsRes, { prompts: [] })
    : { prompts: [] };
  const instructions = instructionsRes.ok
    ? await parseJsonOrDefault<InstructionsResponse>(instructionsRes, { instructions: [] })
    : { instructions: [] };
  const fallbackHealth = fallbackHealthRes.ok
    ? normalizeFallbackHealth(await parseJsonOrDefault<RuntimeFallbackHealthResponse>(fallbackHealthRes, {}))
    : defaultFallbackHealth();

  // Calculate outdated agents by checking deployments
  let outdatedAgents = 0;
  const missingFiles: string[] = [];

  if (agents.agents && Array.isArray(agents.agents)) {
    for (const agent of agents.agents) {
      if (agent.deployments) {
        const wsDeployment = agent.deployments.find(
          (deployment) => deployment.workspace_id === workspaceId,
        );
        if (!wsDeployment) {
          missingFiles.push(`${agent.agent_id || 'unknown-agent'}.agent.md`);
        } else if (wsDeployment.sync_status === 'outdated') {
          outdatedAgents++;
        }
      }
    }
  }

  const agentCount = agents.agents?.length || 0;
  const promptCount = prompts.prompts?.length || 0;
  const instructionCount = instructions.instructions?.length || 0;

  const status: CopilotStatus = {
    hasAgents: agentCount > 0,
    hasPrompts: promptCount > 0,
    hasInstructions: instructionCount > 0,
    agentCount,
    promptCount,
    instructionCount,
    outdatedAgents,
    missingFiles,
    fallbackApiHealth: fallbackHealth.state,
    fallbackApiDetail: fallbackHealth.detail,
    fallbackApiCheckedAt: fallbackHealth.checkedAt,
  };

  return { status };
}

// Global Copilot status (not workspace-specific)
export async function fetchGlobalCopilotStatus(): Promise<CopilotStatusResponse> {
  const [agentsRes, promptsRes, instructionsRes, fallbackHealthRes] = await Promise.all([
    fetch(`${API_BASE_URL}/api/agents`),
    fetch(`${API_BASE_URL}/api/prompts`),
    fetch(`${API_BASE_URL}/api/instructions`),
    fetch(`${API_BASE_URL}/api/runtime/fallback-health`),
  ]);

  const agents = agentsRes.ok
    ? await parseJsonOrDefault<AgentsResponse>(agentsRes, { agents: [] })
    : { agents: [] };
  const prompts = promptsRes.ok
    ? await parseJsonOrDefault<PromptsResponse>(promptsRes, { prompts: [] })
    : { prompts: [] };
  const instructions = instructionsRes.ok
    ? await parseJsonOrDefault<InstructionsResponse>(instructionsRes, { instructions: [] })
    : { instructions: [] };
  const fallbackHealth = fallbackHealthRes.ok
    ? normalizeFallbackHealth(await parseJsonOrDefault<RuntimeFallbackHealthResponse>(fallbackHealthRes, {}))
    : defaultFallbackHealth();

  // Calculate total outdated across all workspaces
  let totalOutdated = 0;
  if (agents.agents && Array.isArray(agents.agents)) {
    for (const agent of agents.agents) {
      if (agent.deployments) {
        const outdated = agent.deployments.filter(
          (deployment) => deployment.sync_status === 'outdated',
        ).length;
        totalOutdated += outdated;
      }
    }
  }

  const status: CopilotStatus = {
    hasAgents: (agents.agents?.length || 0) > 0,
    hasPrompts: (prompts.prompts?.length || 0) > 0,
    hasInstructions: (instructions.instructions?.length || 0) > 0,
    agentCount: agents.agents?.length || 0,
    promptCount: prompts.prompts?.length || 0,
    instructionCount: instructions.instructions?.length || 0,
    outdatedAgents: totalOutdated,
    missingFiles: [],
    fallbackApiHealth: fallbackHealth.state,
    fallbackApiDetail: fallbackHealth.detail,
    fallbackApiCheckedAt: fallbackHealth.checkedAt,
  };

  return { status };
}

// Hook for workspace-specific Copilot status
export function useCopilotStatus(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['copilot-status', workspaceId],
    queryFn: () => fetchCopilotStatus(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: 1000 * 60, // Refresh every minute
  });
}

// Hook for global Copilot status
export function useGlobalCopilotStatus() {
  return useQuery({
    queryKey: ['copilot-status', 'global'],
    queryFn: fetchGlobalCopilotStatus,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });
}

export default useCopilotStatus;
