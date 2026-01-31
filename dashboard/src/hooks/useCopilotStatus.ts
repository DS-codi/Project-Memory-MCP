import { useQuery } from '@tanstack/react-query';
import { CopilotStatus } from '@/types';
import { API_BASE_URL } from '@/config';

interface CopilotStatusResponse {
  status: CopilotStatus;
}

// Fetch Copilot status for a workspace
async function fetchCopilotStatus(workspaceId: string): Promise<CopilotStatusResponse> {
  // Fetch agents, prompts, and instructions status in parallel
  const [agentsRes, promptsRes, instructionsRes] = await Promise.all([
    fetch(`${API_BASE_URL}/api/agents`),
    fetch(`${API_BASE_URL}/api/prompts`),
    fetch(`${API_BASE_URL}/api/instructions/workspace/${workspaceId}`),
  ]);

  // Parse responses
  const agents = agentsRes.ok ? await agentsRes.json() : { agents: [] };
  const prompts = promptsRes.ok ? await promptsRes.json() : { prompts: [] };
  const instructions = instructionsRes.ok ? await instructionsRes.json() : { instructions: [] };

  // Calculate outdated agents by checking deployments
  let outdatedAgents = 0;
  const missingFiles: string[] = [];

  if (agents.agents && Array.isArray(agents.agents)) {
    for (const agent of agents.agents) {
      if (agent.deployments) {
        const wsDeployment = agent.deployments.find(
          (d: any) => d.workspace_id === workspaceId
        );
        if (!wsDeployment) {
          missingFiles.push(`${agent.agent_id}.agent.md`);
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
  };

  return { status };
}

// Global Copilot status (not workspace-specific)
async function fetchGlobalCopilotStatus(): Promise<CopilotStatusResponse> {
  const [agentsRes, promptsRes, instructionsRes] = await Promise.all([
    fetch(`${API_BASE_URL}/api/agents`),
    fetch(`${API_BASE_URL}/api/prompts`),
    fetch(`${API_BASE_URL}/api/instructions`),
  ]);

  const agents = agentsRes.ok ? await agentsRes.json() : { agents: [] };
  const prompts = promptsRes.ok ? await promptsRes.json() : { prompts: [] };
  const instructions = instructionsRes.ok ? await instructionsRes.json() : { instructions: [] };

  // Calculate total outdated across all workspaces
  let totalOutdated = 0;
  if (agents.agents && Array.isArray(agents.agents)) {
    for (const agent of agents.agents) {
      if (agent.deployments) {
        const outdated = agent.deployments.filter(
          (d: any) => d.sync_status === 'outdated'
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
