import { promises as fs } from 'fs';
import path from 'path';
import type { ToolResponse } from '../types/index.js';
import * as store from '../storage/file-store.js';
import * as knowledgeTools from './knowledge.tools.js';
import { listProgramSearchArtifacts } from '../storage/program-store.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_PREVIEW_CHARS = 320;
const MAX_SEARCHABLE_CHARS = 8192;

type SearchScope = 'plan' | 'workspace' | 'program' | 'all';

type SearchType =
  | 'plan_context'
  | 'research_note'
  | 'workspace_context'
  | 'knowledge_file'
  | 'program_state'
  | 'program_manifest'
  | 'program_dependencies'
  | 'program_risks';

interface SearchContextParams {
  workspace_id: string;
  plan_id?: string;
  query?: string;
  scope?: SearchScope;
  types?: string[];
  limit?: number;
}

interface SearchItem {
  id: string;
  scope: 'plan' | 'workspace' | 'program';
  type: SearchType;
  title: string;
  source: string;
  path: string;
  preview: string;
  size_bytes: number;
  updated_at: string;
  searchable_text: string;
}

function normalizeLimit(limit?: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  const rounded = Math.floor(limit);
  if (rounded < 1) return 1;
  if (rounded > MAX_LIMIT) return MAX_LIMIT;
  return rounded;
}

function toPreview(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.slice(0, MAX_PREVIEW_CHARS);
}

function toSearchable(value: string): string {
  return value.toLowerCase().slice(0, MAX_SEARCHABLE_CHARS);
}

function asText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? '');
  }
}

function toPosixRelative(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function parseScopes(scope: SearchScope): Array<'plan' | 'workspace' | 'program'> {
  if (scope === 'all') {
    return ['plan', 'workspace', 'program'];
  }
  return [scope];
}

function normalizeTypes(types?: string[]): Set<string> {
  return new Set((types ?? []).map(type => type.trim().toLowerCase()).filter(Boolean));
}

function matchesFilters(
  item: SearchItem,
  queryLower: string,
  typeFilter: Set<string>
): boolean {
  if (typeFilter.size > 0 && !typeFilter.has(item.type)) {
    return false;
  }
  if (!queryLower) {
    return true;
  }
  return item.searchable_text.includes(queryLower);
}

function stableSortResults(items: SearchItem[]): SearchItem[] {
  const scopeRank: Record<'plan' | 'workspace' | 'program', number> = {
    plan: 0,
    workspace: 1,
    program: 2,
  };
  return [...items].sort((a, b) => {
    if (scopeRank[a.scope] !== scopeRank[b.scope]) {
      return scopeRank[a.scope] - scopeRank[b.scope];
    }
    const typeCmp = a.type.localeCompare(b.type);
    if (typeCmp !== 0) {
      return typeCmp;
    }
    const sourceCmp = a.source.localeCompare(b.source);
    if (sourceCmp !== 0) {
      return sourceCmp;
    }
    const idCmp = a.id.localeCompare(b.id);
    if (idCmp !== 0) {
      return idCmp;
    }
    return a.updated_at.localeCompare(b.updated_at);
  });
}

async function collectPlanContext(
  workspaceId: string,
  planId: string
): Promise<SearchItem[]> {
  const planPath = store.getPlanPath(workspaceId, planId);
  const researchPath = store.getResearchNotesPath(workspaceId, planId);
  const items: SearchItem[] = [];

  try {
    const entries = await fs.readdir(planPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'state.json') {
        continue;
      }
      const filePath = path.join(planPath, entry.name);
      const [content, stat] = await Promise.all([
        fs.readFile(filePath, 'utf-8'),
        fs.stat(filePath),
      ]);
      const title = entry.name.replace(/\.json$/i, '');
      const preview = toPreview(content);
      items.push({
        id: `plan:${planId}:${title}`,
        scope: 'plan',
        type: 'plan_context',
        title,
        source: `plan:${planId}`,
        path: toPosixRelative(filePath),
        preview,
        size_bytes: stat.size,
        updated_at: stat.mtime.toISOString(),
        searchable_text: toSearchable(`${title} ${content}`),
      });
    }
  } catch {
    return items;
  }

  try {
    const entries = await fs.readdir(researchPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const filePath = path.join(researchPath, entry.name);
      const [content, stat] = await Promise.all([
        fs.readFile(filePath, 'utf-8'),
        fs.stat(filePath),
      ]);
      const preview = toPreview(content);
      items.push({
        id: `research:${planId}:${entry.name}`,
        scope: 'plan',
        type: 'research_note',
        title: entry.name,
        source: `plan:${planId}`,
        path: toPosixRelative(filePath),
        preview,
        size_bytes: stat.size,
        updated_at: stat.mtime.toISOString(),
        searchable_text: toSearchable(`${entry.name} ${content}`),
      });
    }
  } catch {
    return items;
  }

  return items;
}

async function collectWorkspaceContext(workspaceId: string): Promise<SearchItem[]> {
  const filePath = store.getWorkspaceContextPath(workspaceId);
  try {
    const [data, stat] = await Promise.all([
      store.readJson<Record<string, unknown>>(filePath),
      fs.stat(filePath),
    ]);
    if (!data) {
      return [];
    }
    const content = asText(data);
    return [{
      id: `workspace:${workspaceId}:context`,
      scope: 'workspace',
      type: 'workspace_context',
      title: 'workspace.context',
      source: `workspace:${workspaceId}`,
      path: toPosixRelative(filePath),
      preview: toPreview(content),
      size_bytes: stat.size,
      updated_at: stat.mtime.toISOString(),
      searchable_text: toSearchable(content),
    }];
  } catch {
    return [];
  }
}

async function collectKnowledgeFiles(workspaceId: string): Promise<SearchItem[]> {
  const listResult = await knowledgeTools.listKnowledgeFiles(workspaceId);
  if (!listResult.success || !listResult.data) {
    return [];
  }

  const items: SearchItem[] = [];
  for (const file of listResult.data.files) {
    const getResult = await knowledgeTools.getKnowledgeFile(workspaceId, file.slug);
    if (!getResult.success || !getResult.data) {
      continue;
    }
    const knowledgeFile = getResult.data.knowledge_file;
    const content = `${knowledgeFile.title} ${knowledgeFile.content}`;
    const filePath = knowledgeTools.getKnowledgeFilePath(workspaceId, file.slug);
    const sizeBytes = Buffer.byteLength(content, 'utf-8');
    items.push({
      id: `knowledge:${file.slug}`,
      scope: 'workspace',
      type: 'knowledge_file',
      title: knowledgeFile.title,
      source: `workspace:${workspaceId}`,
      path: toPosixRelative(filePath),
      preview: toPreview(knowledgeFile.content),
      size_bytes: sizeBytes,
      updated_at: knowledgeFile.updated_at,
      searchable_text: toSearchable(content),
    });
  }

  return items;
}

async function collectProgramFiles(workspaceId: string): Promise<SearchItem[]> {
  const artifacts = await listProgramSearchArtifacts(workspaceId);
  const items: SearchItem[] = [];

  for (const artifact of artifacts) {
    const content = asText(artifact.payload);
    const itemType = artifact.file_type;
    items.push({
      id: `program:${artifact.program_id}:${itemType}`,
      scope: 'program',
      type: itemType,
      title: `${artifact.program_id} ${itemType}`,
      source: `program:${artifact.program_id}`,
      path: toPosixRelative(artifact.file_path),
      preview: toPreview(content),
      size_bytes: Buffer.byteLength(content, 'utf-8'),
      updated_at: artifact.updated_at,
      searchable_text: toSearchable(`${artifact.program_id} ${content}`),
    });
  }

  return items;
}

function stripSearchOnlyFields(item: SearchItem): Record<string, unknown> {
  return {
    id: item.id,
    scope: item.scope,
    type: item.type,
    title: item.title,
    source: item.source,
    path: item.path,
    preview: item.preview,
    size_bytes: item.size_bytes,
    updated_at: item.updated_at,
  };
}

export async function searchContext(
  params: SearchContextParams
): Promise<ToolResponse<{
  scope: SearchScope;
  query: string;
  types: string[];
  limit: number;
  total: number;
  truncated: boolean;
  truncation: {
    requested_limit: number;
    applied_limit: number;
    returned: number;
    total_before_limit: number;
  };
  results: Array<Record<string, unknown>>;
}>> {
  const { workspace_id, plan_id } = params;
  const scope: SearchScope = params.scope ?? 'plan';
  const query = (params.query ?? '').trim();
  const queryLower = query.toLowerCase();
  const limit = normalizeLimit(params.limit);
  const typeFilter = normalizeTypes(params.types);

  const scopes = parseScopes(scope);
  if (scopes.includes('plan') && !plan_id) {
    return {
      success: false,
      error: 'plan_id is required when scope includes plan',
    };
  }

  const collected: SearchItem[] = [];

  if (scopes.includes('plan') && plan_id) {
    collected.push(...await collectPlanContext(workspace_id, plan_id));
  }
  if (scopes.includes('workspace')) {
    collected.push(...await collectWorkspaceContext(workspace_id));
    collected.push(...await collectKnowledgeFiles(workspace_id));
  }
  if (scopes.includes('program')) {
    collected.push(...await collectProgramFiles(workspace_id));
  }

  const filtered = collected.filter(item => matchesFilters(item, queryLower, typeFilter));
  const sorted = stableSortResults(filtered);
  const limited = sorted.slice(0, limit);

  return {
    success: true,
    data: {
      scope,
      query,
      types: Array.from(typeFilter),
      limit,
      total: sorted.length,
      truncated: sorted.length > limit,
      truncation: {
        requested_limit: params.limit ?? DEFAULT_LIMIT,
        applied_limit: limit,
        returned: limited.length,
        total_before_limit: sorted.length,
      },
      results: limited.map(stripSearchOnlyFields),
    },
  };
}