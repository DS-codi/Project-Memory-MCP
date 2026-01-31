import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';

export const searchRouter = Router();

interface SearchResult {
  type: 'workspace' | 'plan' | 'agent' | 'step';
  id: string;
  title: string;
  subtitle?: string;
  path: string;
  matchedField: string;
  score: number;
}

// GET /api/search?q=query
searchRouter.get('/', async (req, res) => {
  try {
    const query = (req.query.q as string || '').toLowerCase().trim();
    
    if (!query || query.length < 2) {
      return res.json({ results: [] });
    }

    const results: SearchResult[] = [];

    // Search workspaces
    const workspaceResults = await searchWorkspaces(query);
    results.push(...workspaceResults);

    // Search plans
    const planResults = await searchPlans(query);
    results.push(...planResults);

    // Search agents
    const agentResults = await searchAgents(query);
    results.push(...agentResults);

    // Sort by score (higher is better)
    results.sort((a, b) => b.score - a.score);

    // Limit results
    const maxResults = parseInt(req.query.limit as string) || 20;
    
    res.json({ 
      results: results.slice(0, maxResults),
      total: results.length,
      query,
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

async function searchWorkspaces(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  try {
    const entries = await fs.readdir(globalThis.MBS_DATA_ROOT, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'logs') continue;
      
      const metaPath = path.join(globalThis.MBS_DATA_ROOT, entry.name, 'workspace.meta.json');
      
      try {
        const content = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(content);
        
        const name = meta.name?.toLowerCase() || '';
        const wsPath = meta.path?.toLowerCase() || '';
        
        let score = 0;
        let matchedField = '';
        
        if (name.includes(query)) {
          score = name === query ? 100 : 80;
          matchedField = 'name';
        } else if (wsPath.includes(query)) {
          score = 50;
          matchedField = 'path';
        }
        
        if (score > 0) {
          results.push({
            type: 'workspace',
            id: entry.name,
            title: meta.name || entry.name,
            subtitle: meta.path,
            path: `/workspace/${entry.name}`,
            matchedField,
            score,
          });
        }
      } catch {
        // Skip invalid workspaces
      }
    }
  } catch (error) {
    console.error('Error searching workspaces:', error);
  }
  
  return results;
}

async function searchPlans(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  try {
    const workspaces = await fs.readdir(globalThis.MBS_DATA_ROOT, { withFileTypes: true });
    
    for (const ws of workspaces) {
      if (!ws.isDirectory() || ws.name === 'logs') continue;
      
      const plansDir = path.join(globalThis.MBS_DATA_ROOT, ws.name, 'plans');
      
      try {
        const plans = await fs.readdir(plansDir, { withFileTypes: true });
        
        for (const plan of plans) {
          if (!plan.isDirectory()) continue;
          
          const statePath = path.join(plansDir, plan.name, 'state.json');
          
          try {
            const content = await fs.readFile(statePath, 'utf-8');
            const state = JSON.parse(content);
            
            const title = state.title?.toLowerCase() || '';
            const description = state.description?.toLowerCase() || '';
            const category = state.category?.toLowerCase() || '';
            const planId = plan.name.toLowerCase();
            
            let score = 0;
            let matchedField = '';
            
            if (title.includes(query)) {
              score = title === query ? 100 : 85;
              matchedField = 'title';
            } else if (description.includes(query)) {
              score = 60;
              matchedField = 'description';
            } else if (category.includes(query)) {
              score = 40;
              matchedField = 'category';
            } else if (planId.includes(query)) {
              score = 30;
              matchedField = 'id';
            }
            
            // Search steps
            if (state.steps && Array.isArray(state.steps)) {
              for (const step of state.steps) {
                if (step.task?.toLowerCase().includes(query)) {
                  score = Math.max(score, 55);
                  matchedField = 'step';
                  break;
                }
              }
            }
            
            if (score > 0) {
              results.push({
                type: 'plan',
                id: plan.name,
                title: state.title || plan.name,
                subtitle: `${state.category || 'unknown'} • ${ws.name}`,
                path: `/workspace/${ws.name}/plan/${plan.name}`,
                matchedField,
                score,
              });
            }
          } catch {
            // Skip invalid plans
          }
        }
      } catch {
        // No plans directory
      }
    }
  } catch (error) {
    console.error('Error searching plans:', error);
  }
  
  return results;
}

async function searchAgents(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  try {
    const entries = await fs.readdir(globalThis.MBS_AGENTS_ROOT, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.agent.md')) continue;
      
      const agentId = entry.name.replace('.agent.md', '');
      const agentIdLower = agentId.toLowerCase();
      
      let score = 0;
      let matchedField = '';
      
      if (agentIdLower.includes(query)) {
        score = agentIdLower === query ? 100 : 75;
        matchedField = 'name';
      } else {
        // Search content
        try {
          const content = await fs.readFile(
            path.join(globalThis.MBS_AGENTS_ROOT, entry.name),
            'utf-8'
          );
          
          if (content.toLowerCase().includes(query)) {
            score = 45;
            matchedField = 'content';
          }
        } catch {
          // Skip unreadable files
        }
      }
      
      if (score > 0) {
        results.push({
          type: 'agent',
          id: agentId,
          title: agentId.charAt(0).toUpperCase() + agentId.slice(1),
          subtitle: `${entry.name}`,
          path: `/agents/${agentId}`,
          matchedField,
          score,
        });
      }
    }
  } catch (error) {
    console.error('Error searching agents:', error);
  }
  
  return results;
}

export default searchRouter;
