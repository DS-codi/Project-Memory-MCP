import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  listWorkspaces,
  searchPlans as dbSearchPlans,
  searchSteps,
} from '../db/queries.js';
import type { PlanRow, StepRow } from '../db/queries.js';

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

    const workspaceId = req.query.workspace_id as string | undefined;

    const results: SearchResult[] = [];

    // Search workspaces (in-memory filter over DB list)
    const wsResults = searchWorkspacesFromDb(query);
    results.push(...wsResults);

    // Search plans via DB LIKE query
    const planRows = dbSearchPlans(query, workspaceId);
    results.push(...planRows.map(planToResult));

    // Search steps via DB LIKE query
    const stepRows = searchSteps(query, workspaceId);
    results.push(...stepRows.map(stepToResult));

    // Search agent source files (still file-based — source files)
    const agentResults = await searchAgents(query);
    results.push(...agentResults);

    // Sort by score desc
    results.sort((a, b) => b.score - a.score);

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function searchWorkspacesFromDb(query: string): SearchResult[] {
  const results: SearchResult[] = [];
  try {
    const workspaces = listWorkspaces();
    for (const ws of workspaces) {
      const name = ws.name.toLowerCase();
      const wsPath = ws.path.toLowerCase();
      const id = ws.id.toLowerCase();

      let score = 0;
      let matchedField = '';

      if (name.includes(query)) {
        score = name === query ? 100 : 80;
        matchedField = 'name';
      } else if (wsPath.includes(query)) {
        score = 50;
        matchedField = 'path';
      } else if (id.includes(query)) {
        score = 30;
        matchedField = 'id';
      }

      if (score > 0) {
        results.push({
          type: 'workspace',
          id: ws.id,
          title: ws.name,
          subtitle: ws.path,
          path: `/workspace/${ws.id}`,
          matchedField,
          score,
        });
      }
    }
  } catch (error) {
    console.error('Error searching workspaces:', error);
  }
  return results;
}

function planToResult(row: PlanRow): SearchResult {
  return {
    type: 'plan',
    id: row.id,
    title: row.title,
    subtitle: `${row.category ?? 'unknown'} • ${row.workspace_id}`,
    path: `/workspace/${row.workspace_id}/plan/${row.id}`,
    matchedField: 'title',
    score: 85,
  };
}

function stepToResult(row: StepRow): SearchResult {
  return {
    type: 'step',
    id: row.id,
    title: row.task,
    subtitle: `Step in plan ${row.plan_id}`,
    path: `/workspace/-/plan/${row.plan_id}`,
    matchedField: 'task',
    score: 55,
  };
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
          // skip unreadable files
        }
      }

      if (score > 0) {
        results.push({
          type: 'agent',
          id: agentId,
          title: agentId.charAt(0).toUpperCase() + agentId.slice(1),
          subtitle: entry.name,
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
