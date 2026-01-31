import { Router } from 'express';
import * as path from 'path';
import { 
  scanAgentTemplates, 
  getAgentDeployments, 
  getAgentTemplate,
  createAgentTemplate,
  updateAgentTemplate,
  deleteAgentTemplate,
  deployAgentToWorkspaces,
  syncAgentToDeployments,
} from '../services/agentScanner.js';

export const agentsRouter = Router();

// GET /api/agents - List all agent templates
agentsRouter.get('/', async (req, res) => {
  try {
    const agents = await scanAgentTemplates(globalThis.MBS_AGENTS_ROOT);
    res.json({
      agents,
      total: agents.length,
    });
  } catch (error) {
    console.error('Error scanning agents:', error);
    res.status(500).json({ error: 'Failed to scan agents' });
  }
});

// GET /api/agents/:agentId - Get single agent with content
agentsRouter.get('/:agentId', async (req, res) => {
  try {
    const agent = await getAgentTemplate(
      globalThis.MBS_AGENTS_ROOT,
      req.params.agentId
    );
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json({ agent });
  } catch (error) {
    console.error('Error getting agent:', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// POST /api/agents - Create new agent template
agentsRouter.post('/', async (req, res) => {
  try {
    const { agent_id, content } = req.body;
    
    if (!agent_id || typeof agent_id !== 'string') {
      return res.status(400).json({ error: 'agent_id is required and must be a string' });
    }
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required and must be a string' });
    }
    
    const agent = await createAgentTemplate(
      globalThis.MBS_AGENTS_ROOT,
      agent_id,
      content
    );
    
    res.status(201).json({ agent });
  } catch (error) {
    console.error('Error creating agent:', error);
    const message = error instanceof Error ? error.message : 'Failed to create agent';
    res.status(400).json({ error: message });
  }
});

// PUT /api/agents/:agentId - Update agent template
agentsRouter.put('/:agentId', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required and must be a string' });
    }
    
    const agent = await updateAgentTemplate(
      globalThis.MBS_AGENTS_ROOT,
      req.params.agentId,
      content
    );
    
    res.json({ agent });
  } catch (error) {
    console.error('Error updating agent:', error);
    const message = error instanceof Error ? error.message : 'Failed to update agent';
    res.status(400).json({ error: message });
  }
});

// DELETE /api/agents/:agentId - Delete agent template
agentsRouter.delete('/:agentId', async (req, res) => {
  try {
    const archive = req.query.archive !== 'false'; // Default to archiving
    const archiveDir = archive 
      ? path.join(globalThis.MBS_AGENTS_ROOT, '..', 'archive', 'old_agents')
      : undefined;
    
    await deleteAgentTemplate(
      globalThis.MBS_AGENTS_ROOT,
      req.params.agentId,
      archiveDir
    );
    
    res.json({ 
      success: true, 
      archived: archive,
      message: archive 
        ? `Agent '${req.params.agentId}' archived` 
        : `Agent '${req.params.agentId}' deleted`
    });
  } catch (error) {
    console.error('Error deleting agent:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete agent';
    res.status(400).json({ error: message });
  }
});

// GET /api/agents/:agentId/deployments - Get deployment status
agentsRouter.get('/:agentId/deployments', async (req, res) => {
  try {
    const deployments = await getAgentDeployments(
      globalThis.MBS_DATA_ROOT,
      globalThis.MBS_AGENTS_ROOT,
      req.params.agentId
    );
    res.json({ deployments });
  } catch (error) {
    console.error('Error getting deployments:', error);
    res.status(500).json({ error: 'Failed to get agent deployments' });
  }
});

// POST /api/agents/:agentId/deploy - Deploy to specific workspaces
agentsRouter.post('/:agentId/deploy', async (req, res) => {
  try {
    const { workspace_ids } = req.body;
    
    if (!workspace_ids || !Array.isArray(workspace_ids) || workspace_ids.length === 0) {
      return res.status(400).json({ error: 'workspace_ids is required and must be a non-empty array' });
    }
    
    const result = await deployAgentToWorkspaces(
      globalThis.MBS_DATA_ROOT,
      globalThis.MBS_AGENTS_ROOT,
      req.params.agentId,
      workspace_ids
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error deploying agent:', error);
    const message = error instanceof Error ? error.message : 'Failed to deploy agent';
    res.status(400).json({ error: message });
  }
});

// POST /api/agents/:agentId/sync - Sync to all deployments
agentsRouter.post('/:agentId/sync', async (req, res) => {
  try {
    const result = await syncAgentToDeployments(
      globalThis.MBS_DATA_ROOT,
      globalThis.MBS_AGENTS_ROOT,
      req.params.agentId
    );
    
    res.json(result);
  } catch (error) {
    console.error('Error syncing agent:', error);
    const message = error instanceof Error ? error.message : 'Failed to sync agent';
    res.status(400).json({ error: message });
  }
});

// GET /api/agents/:agentId/diff/:workspaceId - Get diff between template and deployed
agentsRouter.get('/:agentId/diff/:workspaceId', async (req, res) => {
  try {
    const { agentId, workspaceId } = req.params;
    const fs = await import('fs/promises');
    const crypto = await import('crypto');
    
    // Read template
    const templatePath = path.join(globalThis.MBS_AGENTS_ROOT, `${agentId}.agent.md`);
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const templateStats = await fs.stat(templatePath);
    const templateHash = crypto.createHash('md5').update(templateContent).digest('hex').slice(0, 8);
    
    // Read workspace meta to get path
    const metaPath = path.join(globalThis.MBS_DATA_ROOT, workspaceId, 'workspace.meta.json');
    const metaContent = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(metaContent);
    
    // Read deployed
    const deployedPath = path.join(meta.path, '.github', 'agents', `${agentId}.agent.md`);
    const deployedContent = await fs.readFile(deployedPath, 'utf-8');
    const deployedStats = await fs.stat(deployedPath);
    const deployedHash = crypto.createHash('md5').update(deployedContent).digest('hex').slice(0, 8);
    
    // Generate diff
    const differences = generateDiff(templateContent, deployedContent);
    
    res.json({
      template: {
        content: templateContent,
        hash: templateHash,
        lastModified: templateStats.mtime.toISOString(),
      },
      deployed: {
        content: deployedContent,
        hash: deployedHash,
        lastModified: deployedStats.mtime.toISOString(),
      },
      differences,
    });
  } catch (error) {
    console.error('Error generating diff:', error);
    res.status(500).json({ error: 'Failed to generate diff' });
  }
});

// Simple line-by-line diff generator
function generateDiff(left: string, right: string) {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const result: Array<{
    lineNumber: { left: number | null; right: number | null };
    type: 'unchanged' | 'added' | 'removed' | 'modified';
    left: string;
    right: string;
  }> = [];
  
  const maxLen = Math.max(leftLines.length, rightLines.length);
  
  for (let i = 0; i < maxLen; i++) {
    const leftLine = leftLines[i];
    const rightLine = rightLines[i];
    
    if (leftLine === undefined) {
      result.push({
        lineNumber: { left: null, right: i + 1 },
        type: 'added',
        left: '',
        right: rightLine,
      });
    } else if (rightLine === undefined) {
      result.push({
        lineNumber: { left: i + 1, right: null },
        type: 'removed',
        left: leftLine,
        right: '',
      });
    } else if (leftLine === rightLine) {
      result.push({
        lineNumber: { left: i + 1, right: i + 1 },
        type: 'unchanged',
        left: leftLine,
        right: rightLine,
      });
    } else {
      result.push({
        lineNumber: { left: i + 1, right: i + 1 },
        type: 'modified',
        left: leftLine,
        right: rightLine,
      });
    }
  }
  
  return result;
}

// POST /api/agents/sync-check - Check sync status for all
agentsRouter.post('/sync-check', async (req, res) => {
  try {
    const agents = await scanAgentTemplates(globalThis.MBS_AGENTS_ROOT);
    const syncStatus = await Promise.all(
      agents.map(async (agent) => ({
        agent_id: agent.agent_id,
        deployments: await getAgentDeployments(
          globalThis.MBS_DATA_ROOT,
          globalThis.MBS_AGENTS_ROOT,
          agent.agent_id
        ),
      }))
    );
    res.json({ syncStatus });
  } catch (error) {
    console.error('Error checking sync:', error);
    res.status(500).json({ error: 'Failed to check sync status' });
  }
});

// =============================================================================
// Handoff Configuration Routes
// =============================================================================

import matter from 'gray-matter';
import * as fs from 'fs/promises';

interface HandoffConfig {
  label: string;
  agent: string;
  prompt?: string;
  send?: boolean;
}

// GET /api/agents/:agentId/handoffs - Get handoff configuration
agentsRouter.get('/:agentId/handoffs', async (req, res) => {
  try {
    const agent = await getAgentTemplate(
      globalThis.MBS_AGENTS_ROOT,
      req.params.agentId
    );
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Parse frontmatter to extract handoffs
    const { data: frontmatter } = matter(agent.content);
    const handoffs: HandoffConfig[] = frontmatter.handoffs || [];
    
    res.json({
      agent_id: req.params.agentId,
      handoffs,
      has_handoffs: handoffs.length > 0,
    });
  } catch (error) {
    console.error('Error getting handoffs:', error);
    res.status(500).json({ error: 'Failed to get handoffs' });
  }
});

// PUT /api/agents/:agentId/handoffs - Update handoff configuration
agentsRouter.put('/:agentId/handoffs', async (req, res) => {
  try {
    const { handoffs } = req.body;
    
    if (!Array.isArray(handoffs)) {
      return res.status(400).json({ error: 'handoffs must be an array' });
    }
    
    const agent = await getAgentTemplate(
      globalThis.MBS_AGENTS_ROOT,
      req.params.agentId
    );
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Parse existing content
    const { data: frontmatter, content: body } = matter(agent.content);
    
    // Update handoffs in frontmatter
    frontmatter.handoffs = handoffs;
    
    // Rebuild the file
    const newContent = matter.stringify(body, frontmatter);
    
    // Write back
    const filePath = path.join(globalThis.MBS_AGENTS_ROOT, `${req.params.agentId}.agent.md`);
    await fs.writeFile(filePath, newContent, 'utf-8');
    
    res.json({
      agent_id: req.params.agentId,
      handoffs,
      updated: true,
    });
  } catch (error) {
    console.error('Error updating handoffs:', error);
    res.status(500).json({ error: 'Failed to update handoffs' });
  }
});

// POST /api/agents/:agentId/validate-frontmatter - Validate YAML frontmatter
agentsRouter.post('/:agentId/validate-frontmatter', async (req, res) => {
  try {
    const agent = await getAgentTemplate(
      globalThis.MBS_AGENTS_ROOT,
      req.params.agentId
    );
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      const { data: frontmatter } = matter(agent.content);
      
      // Check required fields
      if (!frontmatter.description) {
        warnings.push('Missing "description" field in frontmatter');
      }
      
      // Validate handoffs structure
      if (frontmatter.handoffs) {
        if (!Array.isArray(frontmatter.handoffs)) {
          errors.push('handoffs must be an array');
        } else {
          frontmatter.handoffs.forEach((h: any, i: number) => {
            if (!h.label) errors.push(`handoffs[${i}]: missing "label" field`);
            if (!h.agent) errors.push(`handoffs[${i}]: missing "agent" field`);
          });
        }
      }
      
      // Check tools array
      if (frontmatter.tools && !Array.isArray(frontmatter.tools)) {
        errors.push('tools must be an array');
      }
      
    } catch (parseError) {
      errors.push(`YAML parse error: ${(parseError as Error).message}`);
    }
    
    res.json({
      agent_id: req.params.agentId,
      valid: errors.length === 0,
      errors,
      warnings,
    });
  } catch (error) {
    console.error('Error validating frontmatter:', error);
    res.status(500).json({ error: 'Failed to validate frontmatter' });
  }
});
