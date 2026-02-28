import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs modules
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  access: vi.fn(),
  copyFile: vi.fn(),
  rename: vi.fn(),
  cp: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  copyFileSync: vi.fn(),
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
  },
}));

import * as fs from 'fs/promises';
import { existsSync } from 'fs';

// Deployment service simulation
const deploymentService = {
  async deployAgentsToWorkspace(
    agentsDir: string,
    workspacePath: string,
    options: { includePrompts?: boolean; includeInstructions?: boolean } = {}
  ) {
    const targetGithubDir = `${workspacePath}/.github`;
    const targetAgentsDir = `${targetGithubDir}/agents`;
    
    // Create directories
    await fs.mkdir(targetAgentsDir, { recursive: true });
    
    // Get agent files
    const agentFiles = await fs.readdir(agentsDir);
    const deployedAgents: string[] = [];
    
    for (const file of agentFiles) {
      if (file.endsWith('.agent.md')) {
        await fs.copyFile(`${agentsDir}/${file}`, `${targetAgentsDir}/${file}`);
        deployedAgents.push(file);
      }
    }
    
    // Deploy prompts if requested
    let deployedPrompts: string[] = [];
    if (options.includePrompts) {
      const promptsDir = agentsDir.replace('/agents', '/prompts');
      const targetPromptsDir = `${targetGithubDir}/prompts`;
      await fs.mkdir(targetPromptsDir, { recursive: true });
      
      try {
        const promptFiles = await fs.readdir(promptsDir);
        for (const file of promptFiles) {
          if (file.endsWith('.prompt.md')) {
            await fs.copyFile(`${promptsDir}/${file}`, `${targetPromptsDir}/${file}`);
            deployedPrompts.push(file);
          }
        }
      } catch {
        // Prompts dir may not exist
      }
    }
    
    // Deploy instructions if requested
    let deployedInstructions: string[] = [];
    if (options.includeInstructions) {
      const instructionsDir = agentsDir.replace('/agents', '/instructions');
      const targetInstructionsDir = `${targetGithubDir}/instructions`;
      await fs.mkdir(targetInstructionsDir, { recursive: true });
      
      try {
        const instructionFiles = await fs.readdir(instructionsDir);
        for (const file of instructionFiles) {
          if (file.endsWith('.instructions.md')) {
            await fs.copyFile(`${instructionsDir}/${file}`, `${targetInstructionsDir}/${file}`);
            deployedInstructions.push(file);
          }
        }
      } catch {
        // Instructions dir may not exist
      }
    }
    
    return {
      agents: deployedAgents,
      prompts: deployedPrompts,
      instructions: deployedInstructions,
    };
  },
  
  async verifyDeployment(workspacePath: string) {
    const results = {
      hasAgents: false,
      hasPrompts: false,
      hasInstructions: false,
      agentCount: 0,
      promptCount: 0,
      instructionCount: 0,
    };
    
    try {
      const agents = await fs.readdir(`${workspacePath}/.github/agents`);
      results.hasAgents = agents.length > 0;
      results.agentCount = agents.filter((f: string) => f.endsWith('.agent.md')).length;
    } catch {
      // Directory doesn't exist
    }
    
    try {
      const prompts = await fs.readdir(`${workspacePath}/.github/prompts`);
      results.hasPrompts = prompts.length > 0;
      results.promptCount = prompts.filter((f: string) => f.endsWith('.prompt.md')).length;
    } catch {
      // Directory doesn't exist
    }
    
    try {
      const instructions = await fs.readdir(`${workspacePath}/.github/instructions`);
      results.hasInstructions = instructions.length > 0;
      results.instructionCount = instructions.filter((f: string) => f.endsWith('.instructions.md')).length;
    } catch {
      // Directory doesn't exist
    }
    
    return results;
  },
};

describe('Deployment Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('deployAgentsToWorkspace', () => {
    it('should create .github/agents directory in workspace', async () => {
      const agentFiles = [
        'coordinator.agent.md',
        'researcher.agent.md',
        'architect.agent.md',
      ];
      
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(agentFiles);
      (fs.copyFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      
      await deploymentService.deployAgentsToWorkspace(
        '/templates/agents',
        '/workspace/project'
      );
      
      expect(fs.mkdir).toHaveBeenCalledWith(
        '/workspace/project/.github/agents',
        { recursive: true }
      );
    });

    it('should copy all agent files to workspace', async () => {
      const agentFiles = [
        'coordinator.agent.md',
        'researcher.agent.md',
        'executor.agent.md',
      ];
      
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(agentFiles);
      (fs.copyFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      
      const result = await deploymentService.deployAgentsToWorkspace(
        '/templates/agents',
        '/workspace/project'
      );
      
      expect(result.agents).toHaveLength(3);
      expect(fs.copyFile).toHaveBeenCalledTimes(3);
    });

    it('should deploy prompts when includePrompts is true', async () => {
      const agentFiles = ['coordinator.agent.md'];
      const promptFiles = ['new-feature.prompt.md', 'fix-bug.prompt.md'];
      
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readdir as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(agentFiles)
        .mockResolvedValueOnce(promptFiles);
      (fs.copyFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      
      const result = await deploymentService.deployAgentsToWorkspace(
        '/templates/agents',
        '/workspace/project',
        { includePrompts: true }
      );
      
      expect(result.prompts).toHaveLength(2);
      expect(fs.mkdir).toHaveBeenCalledWith(
        '/workspace/project/.github/prompts',
        { recursive: true }
      );
    });

    it('should deploy instructions when includeInstructions is true', async () => {
      const agentFiles = ['coordinator.agent.md'];
      const instructionFiles = ['mcp-usage.instructions.md', 'tests.instructions.md'];
      
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readdir as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(agentFiles)
        .mockResolvedValueOnce(instructionFiles);
      (fs.copyFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      
      const result = await deploymentService.deployAgentsToWorkspace(
        '/templates/agents',
        '/workspace/project',
        { includeInstructions: true }
      );
      
      expect(result.instructions).toHaveLength(2);
    });

    it('should deploy all copilot config when both flags are true', async () => {
      const agentFiles = ['coordinator.agent.md', 'executor.agent.md'];
      const promptFiles = ['new-feature.prompt.md'];
      const instructionFiles = ['tests.instructions.md'];
      
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readdir as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(agentFiles)
        .mockResolvedValueOnce(promptFiles)
        .mockResolvedValueOnce(instructionFiles);
      (fs.copyFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      
      const result = await deploymentService.deployAgentsToWorkspace(
        '/templates/agents',
        '/workspace/project',
        { includePrompts: true, includeInstructions: true }
      );
      
      expect(result.agents).toHaveLength(2);
      expect(result.prompts).toHaveLength(1);
      expect(result.instructions).toHaveLength(1);
    });
  });

  describe('verifyDeployment', () => {
    it('should detect deployed agents', async () => {
      (fs.readdir as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(['coordinator.agent.md', 'executor.agent.md'])
        .mockRejectedValueOnce({ code: 'ENOENT' })
        .mockRejectedValueOnce({ code: 'ENOENT' });
      
      const result = await deploymentService.verifyDeployment('/workspace');
      
      expect(result.hasAgents).toBe(true);
      expect(result.agentCount).toBe(2);
    });

    it('should detect all deployed file types', async () => {
      (fs.readdir as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(['coordinator.agent.md'])
        .mockResolvedValueOnce(['new-feature.prompt.md'])
        .mockResolvedValueOnce(['tests.instructions.md']);
      
      const result = await deploymentService.verifyDeployment('/workspace');
      
      expect(result.hasAgents).toBe(true);
      expect(result.hasPrompts).toBe(true);
      expect(result.hasInstructions).toBe(true);
    });

    it('should report zero counts for missing directories', async () => {
      (fs.readdir as ReturnType<typeof vi.fn>)
        .mockRejectedValue({ code: 'ENOENT' });
      
      const result = await deploymentService.verifyDeployment('/workspace');
      
      expect(result.hasAgents).toBe(false);
      expect(result.hasPrompts).toBe(false);
      expect(result.hasInstructions).toBe(false);
      expect(result.agentCount).toBe(0);
    });
  });
});

describe('Handoff State Tracking', () => {
  // Simulated handoff tracking service
  const handoffTracker = {
    handoffs: [] as Array<{
      planId: string;
      fromAgent: string;
      toAgent: string;
      timestamp: string;
      reason: string;
    }>,
    
    recordHandoff(planId: string, fromAgent: string, toAgent: string, reason: string) {
      this.handoffs.push({
        planId,
        fromAgent,
        toAgent,
        timestamp: new Date().toISOString(),
        reason,
      });
    },
    
    getHandoffsForPlan(planId: string) {
      return this.handoffs.filter(h => h.planId === planId);
    },
    
    getLastAgent(planId: string) {
      const planHandoffs = this.getHandoffsForPlan(planId);
      if (planHandoffs.length === 0) return null;
      return planHandoffs[planHandoffs.length - 1].toAgent;
    },
    
    clearHandoffs() {
      this.handoffs = [];
    },
  };

  beforeEach(() => {
    handoffTracker.clearHandoffs();
  });

  it('should record handoff from Coordinator to Researcher', () => {
    handoffTracker.recordHandoff(
      'plan_123',
      'Coordinator',
      'Researcher',
      'Need to research OAuth providers'
    );
    
    const handoffs = handoffTracker.getHandoffsForPlan('plan_123');
    
    expect(handoffs).toHaveLength(1);
    expect(handoffs[0].fromAgent).toBe('Coordinator');
    expect(handoffs[0].toAgent).toBe('Researcher');
  });

  it('should track multiple handoffs in sequence', () => {
    handoffTracker.recordHandoff('plan_123', 'Coordinator', 'Researcher', 'Research phase');
    handoffTracker.recordHandoff('plan_123', 'Researcher', 'Coordinator', 'Research complete');
    handoffTracker.recordHandoff('plan_123', 'Coordinator', 'Architect', 'Design phase');
    handoffTracker.recordHandoff('plan_123', 'Architect', 'Coordinator', 'Design complete');
    
    const handoffs = handoffTracker.getHandoffsForPlan('plan_123');
    
    expect(handoffs).toHaveLength(4);
  });

  it('should return last agent for plan', () => {
    handoffTracker.recordHandoff('plan_123', 'Coordinator', 'Researcher', 'Research');
    handoffTracker.recordHandoff('plan_123', 'Researcher', 'Coordinator', 'Complete');
    handoffTracker.recordHandoff('plan_123', 'Coordinator', 'Executor', 'Implement');
    
    const lastAgent = handoffTracker.getLastAgent('plan_123');
    
    expect(lastAgent).toBe('Executor');
  });

  it('should track handoffs for multiple plans separately', () => {
    handoffTracker.recordHandoff('plan_123', 'Coordinator', 'Researcher', 'Research');
    handoffTracker.recordHandoff('plan_456', 'Coordinator', 'Architect', 'Design');
    
    const plan123Handoffs = handoffTracker.getHandoffsForPlan('plan_123');
    const plan456Handoffs = handoffTracker.getHandoffsForPlan('plan_456');
    
    expect(plan123Handoffs).toHaveLength(1);
    expect(plan456Handoffs).toHaveLength(1);
    expect(plan123Handoffs[0].toAgent).toBe('Researcher');
    expect(plan456Handoffs[0].toAgent).toBe('Architect');
  });

  it('should verify hub-and-spoke pattern (agents return to Coordinator)', () => {
    // Simulate a full workflow
    handoffTracker.recordHandoff('plan_123', 'Coordinator', 'Researcher', 'Start research');
    handoffTracker.recordHandoff('plan_123', 'Researcher', 'Coordinator', 'Research done');
    handoffTracker.recordHandoff('plan_123', 'Coordinator', 'Architect', 'Start design');
    handoffTracker.recordHandoff('plan_123', 'Architect', 'Coordinator', 'Design done');
    handoffTracker.recordHandoff('plan_123', 'Coordinator', 'Executor', 'Start implementation');
    handoffTracker.recordHandoff('plan_123', 'Executor', 'Coordinator', 'Implementation done');
    
    const handoffs = handoffTracker.getHandoffsForPlan('plan_123');
    
    // Verify all specialists return to Coordinator
    const returnsToCoordinator = handoffs.filter(
      (h, i) => i % 2 === 1 && h.toAgent === 'Coordinator'
    );
    
    expect(returnsToCoordinator).toHaveLength(3);
  });
});
