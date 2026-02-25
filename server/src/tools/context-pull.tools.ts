import { promises as fs } from 'fs';
import path from 'path';
import type { ToolResponse } from '../types/index.js';
import * as store from '../storage/db-store.js';
import {
  getAgentPullManifestPath,
  getAgentPullSessionDir,
} from '../storage/db-store.js';
import { searchContext } from './context-search.tools.js';

type PullScope = 'plan' | 'workspace' | 'program' | 'all';

interface PullParams {
  workspace_id: string;
  plan_id?: string;
  scope?: PullScope;
  query?: string;
  types?: string[];
  selectors?: Array<Record<string, unknown>>;
  limit?: number;
  session_id?: string;
}

interface SearchItem {
  id?: string;
  scope?: string;
  type?: string;
  title?: string;
  source?: string;
  path?: string;
  preview?: string;
  size_bytes?: number;
  updated_at?: string;
}

function normalizeSessionId(sessionId?: string): string {
  const fallback = `session-${Date.now()}`;
  const value = (sessionId ?? fallback).trim() || fallback;
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function normalizeAgentName(agentName?: string): string {
  const fallback = 'unknown';
  const value = (agentName ?? fallback).trim().toLowerCase() || fallback;
  return value.replace(/[^a-z0-9._-]/g, '_');
}

function safeSlug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'item';
}

function toAbsolutePath(filePath: string): string {
  if (/^[a-zA-Z]:\//.test(filePath)) {
    return filePath.replace(/\//g, path.sep);
  }
  return filePath;
}

function selectorMatches(item: SearchItem, selector: Record<string, unknown>, index: number): boolean {
  const selectorId = typeof selector.id === 'string' ? selector.id : undefined;
  const selectorPath = typeof selector.path === 'string' ? selector.path : undefined;
  const selectorSource = typeof selector.source === 'string' ? selector.source : undefined;
  const selectorType = typeof selector.type === 'string' ? selector.type : undefined;
  const selectorTitle = typeof selector.title === 'string' ? selector.title : undefined;
  const selectorIndex = typeof selector.index === 'number' ? Math.floor(selector.index) : undefined;

  if (selectorId && item.id === selectorId) {
    return true;
  }
  if (selectorPath && item.path === selectorPath) {
    return true;
  }
  if (selectorIndex !== undefined && selectorIndex === index) {
    return true;
  }

  if (selectorSource || selectorType || selectorTitle) {
    const sourceOk = selectorSource ? item.source === selectorSource : true;
    const typeOk = selectorType ? item.type === selectorType : true;
    const titleOk = selectorTitle ? item.title === selectorTitle : true;
    return sourceOk && typeOk && titleOk;
  }

  return false;
}

function selectItems(
  items: SearchItem[],
  selectors: Array<Record<string, unknown>>,
): SearchItem[] {
  if (selectors.length === 0) {
    return items;
  }
  const selected = items.filter((item, index) =>
    selectors.some(selector => selectorMatches(item, selector, index)),
  );
  return selected;
}

async function resolveWorkspacePath(workspaceId: string): Promise<string | null> {
  const workspace = await store.getWorkspace(workspaceId);
  if (!workspace) {
    return null;
  }
  return workspace.workspace_path || workspace.path || null;
}

async function resolveActiveAgentName(workspaceId: string, planId?: string): Promise<string> {
  if (!planId) {
    return 'unknown';
  }
  const plan = await store.getPlanState(workspaceId, planId);
  return normalizeAgentName(plan?.current_agent || undefined);
}

interface StagedArtifact {
  selector_id: string;
  source_path: string;
  staged_path: string;
  bytes: number;
  type: string;
  title: string;
}

export async function pullContext(
  params: PullParams,
): Promise<ToolResponse<{
  scope: PullScope;
  selectors: Array<Record<string, unknown>>;
  total: number;
  staged: Array<Record<string, unknown>>;
}>> {
  const scope: PullScope = params.scope ?? 'plan';
  const selectors = params.selectors ?? [];

  const searchResult = await searchContext({
    workspace_id: params.workspace_id,
    plan_id: params.plan_id,
    scope,
    query: params.query,
    types: params.types,
    limit: params.limit,
  });

  if (!searchResult.success || !searchResult.data) {
    return {
      success: false,
      error: searchResult.error || 'Failed to resolve context items for pull',
    };
  }

  const workspacePath = await resolveWorkspacePath(params.workspace_id);
  if (!workspacePath) {
    return {
      success: false,
      error: `Workspace path not found for workspace_id: ${params.workspace_id}`,
    };
  }

  const sessionId = normalizeSessionId(params.session_id);
  const activeAgent = await resolveActiveAgentName(params.workspace_id, params.plan_id);

  const stagedDir = getAgentPullSessionDir(workspacePath, activeAgent, sessionId);
  const manifestPath = getAgentPullManifestPath(workspacePath, activeAgent, sessionId);
  await fs.mkdir(stagedDir, { recursive: true });

  const items = (searchResult.data.results ?? []) as SearchItem[];
  const selectedItems = selectItems(items, selectors);
  const stagedArtifacts: StagedArtifact[] = [];

  for (let index = 0; index < selectedItems.length; index += 1) {
    const item = selectedItems[index];
    const sourcePath = item.path ?? '';
    const sourceTitle = item.title ?? `item-${index + 1}`;
    const sourceType = item.type ?? 'unknown';
    const fileBase = `${String(index + 1).padStart(3, '0')}-${safeSlug(`${sourceType}-${sourceTitle}`)}`;
    const stagedFilePath = path.join(stagedDir, `${fileBase}.json`);

    let content = item.preview ?? '';
    if (sourcePath) {
      try {
        content = await fs.readFile(toAbsolutePath(sourcePath), 'utf-8');
      } catch {
        // fallback to search preview
      }
    }

    const stagedPayload = {
      pulled_at: new Date().toISOString(),
      item,
      content,
    };

    const serialized = JSON.stringify(stagedPayload, null, 2);
    await fs.writeFile(stagedFilePath, serialized, 'utf-8');

    stagedArtifacts.push({
      selector_id: item.id || `${index}`,
      source_path: sourcePath,
      staged_path: stagedFilePath,
      bytes: Buffer.byteLength(serialized, 'utf-8'),
      type: sourceType,
      title: sourceTitle,
    });
  }

  const manifest = {
    workspace_id: params.workspace_id,
    plan_id: params.plan_id,
    active_agent: activeAgent,
    session_id: sessionId,
    scope,
    query: params.query ?? '',
    types: params.types ?? [],
    selectors,
    total_candidates: items.length,
    staged_count: stagedArtifacts.length,
    staged_files: stagedArtifacts,
    generated_at: new Date().toISOString(),
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  return {
    success: true,
    data: {
      scope,
      selectors,
      total: stagedArtifacts.length,
      staged: stagedArtifacts.map(item => ({
        id: item.selector_id,
        source_path: item.source_path,
        staged_path: item.staged_path,
        bytes: item.bytes,
        type: item.type,
        title: item.title,
      })),
    },
  };
}