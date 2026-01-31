import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

interface AgentTemplate {
  agent_id: string;
  template_path: string;
  template_hash: string;
  template_updated_at: string;
  content?: string;
}

interface AgentDeployment {
  workspace_id: string;
  workspace_name: string;
  deployed_path: string;
  version_hash: string;
  is_customized: boolean;
  last_updated: string;
  sync_status: 'synced' | 'outdated' | 'customized' | 'missing';
}

export interface CreateAgentRequest {
  agent_id: string;
  content: string;
}

export interface UpdateAgentRequest {
  content: string;
}

export interface DeployAgentRequest {
  workspace_ids: string[];
}

// Calculate file hash
async function getFileHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
}

// Get file modification time
async function getFileMtime(filePath: string): Promise<string> {
  const stats = await fs.stat(filePath);
  return stats.mtime.toISOString();
}

// Scan agent templates from agents root
export async function scanAgentTemplates(agentsRoot: string): Promise<AgentTemplate[]> {
  const agents: AgentTemplate[] = [];
  
  try {
    const entries = await fs.readdir(agentsRoot, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.agent.md')) continue;
      
      const filePath = path.join(agentsRoot, entry.name);
      const agentId = entry.name.replace('.agent.md', '');
      
      try {
        const hash = await getFileHash(filePath);
        const mtime = await getFileMtime(filePath);
        
        agents.push({
          agent_id: agentId,
          template_path: filePath,
          template_hash: hash,
          template_updated_at: mtime,
        });
      } catch (error) {
        console.error(`Error reading agent template ${entry.name}:`, error);
      }
    }
  } catch (error) {
    console.error('Error scanning agent templates:', error);
  }
  
  return agents;
}

// Get deployments for a specific agent across all workspaces
export async function getAgentDeployments(
  dataRoot: string,
  agentsRoot: string,
  agentId: string
): Promise<AgentDeployment[]> {
  const deployments: AgentDeployment[] = [];
  
  // Get template hash for comparison
  const templatePath = path.join(agentsRoot, `${agentId}.agent.md`);
  let templateHash: string;
  let templateMtime: Date;
  
  try {
    templateHash = await getFileHash(templatePath);
    const stats = await fs.stat(templatePath);
    templateMtime = stats.mtime;
  } catch {
    // Template doesn't exist
    return deployments;
  }
  
  // Scan workspaces for deployments
  try {
    const entries = await fs.readdir(dataRoot, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'logs') continue;
      
      // Read workspace meta
      const metaPath = path.join(dataRoot, entry.name, 'workspace.meta.json');
      let workspacePath: string;
      let workspaceName: string;
      
      try {
        const metaContent = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaContent);
        workspacePath = meta.path;
        workspaceName = meta.name;
      } catch {
        continue;
      }
      
      // Check for agent deployment
      const deployedPath = path.join(workspacePath, '.github', 'agents', `${agentId}.agent.md`);
      
      try {
        const deployedHash = await getFileHash(deployedPath);
        const deployedStats = await fs.stat(deployedPath);
        
        let syncStatus: 'synced' | 'outdated' | 'customized';
        let isCustomized = false;
        
        if (deployedHash === templateHash) {
          syncStatus = 'synced';
        } else if (deployedStats.mtime < templateMtime) {
          syncStatus = 'outdated';
        } else {
          syncStatus = 'customized';
          isCustomized = true;
        }
        
        deployments.push({
          workspace_id: entry.name,
          workspace_name: workspaceName,
          deployed_path: deployedPath,
          version_hash: deployedHash,
          is_customized: isCustomized,
          last_updated: deployedStats.mtime.toISOString(),
          sync_status: syncStatus,
        });
      } catch {
        // Agent not deployed to this workspace - mark as missing
        deployments.push({
          workspace_id: entry.name,
          workspace_name: workspaceName,
          deployed_path: deployedPath,
          version_hash: '',
          is_customized: false,
          last_updated: '',
          sync_status: 'missing',
        });
      }
    }
  } catch (error) {
    console.error('Error scanning agent deployments:', error);
  }
  
  return deployments;
}

// Get single agent template with content
export async function getAgentTemplate(
  agentsRoot: string,
  agentId: string
): Promise<AgentTemplate & { content: string } | null> {
  const templatePath = path.join(agentsRoot, `${agentId}.agent.md`);
  
  try {
    const content = await fs.readFile(templatePath, 'utf-8');
    const hash = await getFileHash(templatePath);
    const mtime = await getFileMtime(templatePath);
    
    return {
      agent_id: agentId,
      template_path: templatePath,
      template_hash: hash,
      template_updated_at: mtime,
      content,
    };
  } catch {
    return null;
  }
}

// Create new agent template
export async function createAgentTemplate(
  agentsRoot: string,
  agentId: string,
  content: string
): Promise<AgentTemplate> {
  // Validate agent_id (alphanumeric + hyphen/underscore only)
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(agentId)) {
    throw new Error('Invalid agent_id: must start with a letter and contain only alphanumeric characters, hyphens, and underscores');
  }
  
  const templatePath = path.join(agentsRoot, `${agentId}.agent.md`);
  
  // Check if already exists
  try {
    await fs.access(templatePath);
    throw new Error(`Agent '${agentId}' already exists`);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  
  // Ensure content has proper markdown structure
  const formattedContent = formatAgentContent(agentId, content);
  
  // Write the file
  await fs.writeFile(templatePath, formattedContent, 'utf-8');
  
  const hash = await getFileHash(templatePath);
  const mtime = await getFileMtime(templatePath);
  
  return {
    agent_id: agentId,
    template_path: templatePath,
    template_hash: hash,
    template_updated_at: mtime,
  };
}

// Update existing agent template
export async function updateAgentTemplate(
  agentsRoot: string,
  agentId: string,
  content: string
): Promise<AgentTemplate> {
  const templatePath = path.join(agentsRoot, `${agentId}.agent.md`);
  
  // Check if exists
  try {
    await fs.access(templatePath);
  } catch {
    throw new Error(`Agent '${agentId}' not found`);
  }
  
  // Write the updated content
  await fs.writeFile(templatePath, content, 'utf-8');
  
  const hash = await getFileHash(templatePath);
  const mtime = await getFileMtime(templatePath);
  
  return {
    agent_id: agentId,
    template_path: templatePath,
    template_hash: hash,
    template_updated_at: mtime,
  };
}

// Delete agent template
export async function deleteAgentTemplate(
  agentsRoot: string,
  agentId: string,
  archiveDir?: string
): Promise<void> {
  const templatePath = path.join(agentsRoot, `${agentId}.agent.md`);
  
  // Check if exists
  try {
    await fs.access(templatePath);
  } catch {
    throw new Error(`Agent '${agentId}' not found`);
  }
  
  if (archiveDir) {
    // Move to archive instead of deleting
    const archivePath = path.join(archiveDir, `${agentId}.agent.md`);
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.rename(templatePath, archivePath);
  } else {
    // Hard delete
    await fs.unlink(templatePath);
  }
}

// Deploy agent to workspace(s)
export async function deployAgentToWorkspaces(
  dataRoot: string,
  agentsRoot: string,
  agentId: string,
  workspaceIds: string[]
): Promise<{ success: string[]; failed: { workspace_id: string; error: string }[] }> {
  const templatePath = path.join(agentsRoot, `${agentId}.agent.md`);
  
  // Read template content
  let templateContent: string;
  try {
    templateContent = await fs.readFile(templatePath, 'utf-8');
  } catch {
    throw new Error(`Agent template '${agentId}' not found`);
  }
  
  const success: string[] = [];
  const failed: { workspace_id: string; error: string }[] = [];
  
  for (const workspaceId of workspaceIds) {
    try {
      // Read workspace meta to get path
      const metaPath = path.join(dataRoot, workspaceId, 'workspace.meta.json');
      const metaContent = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(metaContent);
      const workspacePath = meta.path;
      
      // Create .github/agents directory if needed
      const agentsDir = path.join(workspacePath, '.github', 'agents');
      await fs.mkdir(agentsDir, { recursive: true });
      
      // Write agent file
      const deployedPath = path.join(agentsDir, `${agentId}.agent.md`);
      await fs.writeFile(deployedPath, templateContent, 'utf-8');
      
      success.push(workspaceId);
    } catch (error) {
      failed.push({
        workspace_id: workspaceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  return { success, failed };
}

// Sync agent from template to all deployments
export async function syncAgentToDeployments(
  dataRoot: string,
  agentsRoot: string,
  agentId: string
): Promise<{ synced: string[]; skipped: string[]; failed: { workspace_id: string; error: string }[] }> {
  const deployments = await getAgentDeployments(dataRoot, agentsRoot, agentId);
  
  // Get workspaces that need syncing (outdated or missing)
  const toSync = deployments
    .filter(d => d.sync_status === 'outdated' || d.sync_status === 'missing')
    .map(d => d.workspace_id);
  
  // Skip customized deployments
  const skipped = deployments
    .filter(d => d.sync_status === 'customized')
    .map(d => d.workspace_id);
  
  if (toSync.length === 0) {
    return { synced: [], skipped, failed: [] };
  }
  
  const result = await deployAgentToWorkspaces(dataRoot, agentsRoot, agentId, toSync);
  
  return {
    synced: result.success,
    skipped,
    failed: result.failed,
  };
}

// Format agent content with proper structure
function formatAgentContent(agentId: string, content: string): string {
  const agentName = agentId.charAt(0).toUpperCase() + agentId.slice(1);
  
  // If content doesn't start with a heading, add one
  if (!content.startsWith('#')) {
    return `# ${agentName} Agent\n\n${content}`;
  }
  
  return content;
}
