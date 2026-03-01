import path from 'path';
import type { ToolResponse } from '../types/index.js';
import * as store from '../storage/db-store.js';
import * as knowledgeTools from './knowledge.tools.js';
import { listProgramSearchArtifacts } from '../storage/db-store.js';

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

interface PromptAnalystDiscoverParams {
  workspace_id: string;
  query: string;
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
  content?: string;
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

function extractKeywords(text: string): string[] {
  return [...new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .map(token => token.trim())
      .filter(token => token.length >= 2)
  )];
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
  const items: SearchItem[] = [];

  const contextTypes = await store.listPlanContextTypesFromDb(workspaceId, planId);
  for (const contextType of contextTypes) {
    const payload = await store.getPlanContextFromDb(workspaceId, planId, contextType);
    if (payload === null) continue;

    const content = asText(payload);
    items.push({
      id: `plan:${planId}:${contextType}`,
      scope: 'plan',
      type: 'plan_context',
      title: contextType,
      source: `plan:${planId}`,
      path: `db://plan/${planId}/context/${contextType}`,
      preview: toPreview(content),
      size_bytes: Buffer.byteLength(content, 'utf-8'),
      updated_at: new Date().toISOString(),
      searchable_text: toSearchable(`${contextType} ${content}`),
      content,
    });
  }

  const notes = await store.listPlanResearchNotesFromDb(workspaceId, planId);
  for (const note of notes) {
    const content = note.content;
    items.push({
      id: `research:${planId}:${note.filename}`,
      scope: 'plan',
      type: 'research_note',
      title: note.filename,
      source: `plan:${planId}`,
      path: `db://plan/${planId}/research_notes/${note.filename}`,
      preview: toPreview(content),
      size_bytes: note.size_bytes,
      updated_at: note.updated_at,
      searchable_text: toSearchable(`${note.filename} ${content}`),
      content,
    });
  }

  return items;
}

async function collectWorkspaceContext(workspaceId: string): Promise<SearchItem[]> {
  try {
    const data = await store.getWorkspaceContextFromDb(workspaceId);
    if (!data) {
      return [];
    }
    const content = asText(data);
    const sizeBytes = Buffer.byteLength(content, 'utf-8');
    const updatedAt = data.updated_at || new Date().toISOString();
    return [{
      id: `workspace:${workspaceId}:context`,
      scope: 'workspace',
      type: 'workspace_context',
      title: 'workspace.context',
      source: `workspace:${workspaceId}`,
      path: `${workspaceId}/workspace.context`,
      preview: toPreview(content),
      size_bytes: sizeBytes,
      updated_at: updatedAt,
      searchable_text: toSearchable(content),
      content,
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
      content,
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
      content,
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
    ...(item.content ? { content: item.content } : {}),
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

interface PromptAnalystDiscoveryCandidate {
  workspace_id: string;
  workspace_relation: 'self' | 'linked';
  plan_id: string;
  plan_title: string;
  context_title: string;
  context_type: 'plan_context' | 'research_note';
  snippet: string;
  searchable_text: string;
  updated_at: string;
}

async function collectLinkedWorkspaceIds(rootWorkspaceId: string): Promise<string[]> {
  const visited = new Set<string>();
  const queue: string[] = [rootWorkspaceId];

  while (queue.length > 0) {
    const workspaceId = queue.shift();
    if (!workspaceId || visited.has(workspaceId)) {
      continue;
    }
    visited.add(workspaceId);

    const meta = await store.getWorkspace(workspaceId);
    if (!meta) {
      continue;
    }

    const neighbors = [meta.parent_workspace_id, ...(meta.child_workspace_ids ?? [])]
      .filter((value): value is string => typeof value === 'string' && value.length > 0);

    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        queue.push(neighborId);
      }
    }
  }

  return Array.from(visited);
}

function buildRelevance(
  candidate: PromptAnalystDiscoveryCandidate,
  query: string,
  keywords: string[],
): {
  score: number;
  matched_terms: string[];
  matched_fields: Array<'plan_title' | 'context_title' | 'snippet'>;
} {
  const planTitleLower = candidate.plan_title.toLowerCase();
  const contextTitleLower = candidate.context_title.toLowerCase();
  const snippetLower = candidate.snippet.toLowerCase();
  const queryLower = query.toLowerCase();

  const matchedTerms = keywords.filter((keyword) =>
    planTitleLower.includes(keyword)
    || contextTitleLower.includes(keyword)
    || snippetLower.includes(keyword)
  );

  const matchedFields: Array<'plan_title' | 'context_title' | 'snippet'> = [];
  if (matchedTerms.some(term => planTitleLower.includes(term)) || planTitleLower.includes(queryLower)) {
    matchedFields.push('plan_title');
  }
  if (matchedTerms.some(term => contextTitleLower.includes(term)) || contextTitleLower.includes(queryLower)) {
    matchedFields.push('context_title');
  }
  if (matchedTerms.some(term => snippetLower.includes(term)) || snippetLower.includes(queryLower)) {
    matchedFields.push('snippet');
  }

  const coverage = keywords.length > 0 ? matchedTerms.length / keywords.length : 0;
  const exactBoost = candidate.searchable_text.includes(queryLower) ? 0.25 : 0;
  const titleBoost = matchedFields.includes('plan_title') || matchedFields.includes('context_title') ? 0.2 : 0;
  const relationBoost = candidate.workspace_relation === 'self' ? 0.1 : 0;
  const score = Math.min(1, Math.round((coverage + exactBoost + titleBoost + relationBoost) * 1000) / 1000);

  return {
    score,
    matched_terms: matchedTerms,
    matched_fields: matchedFields,
  };
}

export async function promptAnalystDiscoverLinkedMemory(
  params: PromptAnalystDiscoverParams,
): Promise<ToolResponse<{
  query: string;
  limit: number;
  total: number;
  truncated: boolean;
  linked_workspace_ids: string[];
  related_plan_ids: string[];
  results: Array<{
    workspace_id: string;
    workspace_relation: 'self' | 'linked';
    plan_id: string;
    plan_title: string;
    context_title: string;
    context_type: 'plan_context' | 'research_note';
    snippet: string;
    updated_at: string;
    relevance: {
      score: number;
      matched_terms: string[];
      matched_fields: Array<'plan_title' | 'context_title' | 'snippet'>;
    };
  }>;
}>> {
  const query = params.query.trim();
  if (!query) {
    return {
      success: false,
      error: 'query is required for action: promptanalyst_discover',
    };
  }

  const limit = normalizeLimit(params.limit);
  const linkedWorkspaceIds = await collectLinkedWorkspaceIds(params.workspace_id);
  const keywords = extractKeywords(query);

  const candidates: PromptAnalystDiscoveryCandidate[] = [];
  for (const workspaceId of linkedWorkspaceIds) {
    const workspaceRelation: 'self' | 'linked' = workspaceId === params.workspace_id ? 'self' : 'linked';
    const plans = await store.getWorkspacePlans(workspaceId);
    for (const plan of plans) {
      const planTitle = plan.title;
      const planUpdatedAt = plan.updated_at ?? new Date().toISOString();

      const contextTypes = await store.listPlanContextTypesFromDb(workspaceId, plan.id);
      for (const contextType of contextTypes) {
        const payload = await store.getPlanContextFromDb(workspaceId, plan.id, contextType);
        if (payload === null) continue;
        const content = asText(payload);
        const snippet = toPreview(content);
        candidates.push({
          workspace_id: workspaceId,
          workspace_relation: workspaceRelation,
          plan_id: plan.id,
          plan_title: planTitle,
          context_title: contextType,
          context_type: 'plan_context',
          snippet,
          searchable_text: toSearchable(`${planTitle} ${contextType} ${snippet}`),
          updated_at: planUpdatedAt,
        });
      }

      const notes = await store.listPlanResearchNotesFromDb(workspaceId, plan.id);
      for (const note of notes) {
        const snippet = toPreview(note.content);
        candidates.push({
          workspace_id: workspaceId,
          workspace_relation: workspaceRelation,
          plan_id: plan.id,
          plan_title: planTitle,
          context_title: note.filename,
          context_type: 'research_note',
          snippet,
          searchable_text: toSearchable(`${planTitle} ${note.filename} ${snippet}`),
          updated_at: note.updated_at,
        });
      }
    }
  }

  const queryLower = query.toLowerCase();
  const filtered = candidates.filter((candidate) =>
    candidate.searchable_text.includes(queryLower)
    || (keywords.length > 0 && keywords.some(keyword => candidate.searchable_text.includes(keyword)))
  );

  const scored = filtered.map((candidate) => ({
    candidate,
    relevance: buildRelevance(candidate, query, keywords),
  }));

  scored.sort((a, b) => {
    if (b.relevance.score !== a.relevance.score) {
      return b.relevance.score - a.relevance.score;
    }
    const updatedCmp = b.candidate.updated_at.localeCompare(a.candidate.updated_at);
    if (updatedCmp !== 0) {
      return updatedCmp;
    }
    return a.candidate.context_title.localeCompare(b.candidate.context_title);
  });

  const limited = scored.slice(0, limit);
  const relatedPlanIds = [...new Set(limited.map(item => item.candidate.plan_id))];

  return {
    success: true,
    data: {
      query,
      limit,
      total: scored.length,
      truncated: scored.length > limit,
      linked_workspace_ids: linkedWorkspaceIds,
      related_plan_ids: relatedPlanIds,
      results: limited.map(({ candidate, relevance }) => ({
        workspace_id: candidate.workspace_id,
        workspace_relation: candidate.workspace_relation,
        plan_id: candidate.plan_id,
        plan_title: candidate.plan_title,
        context_title: candidate.context_title,
        context_type: candidate.context_type,
        snippet: candidate.snippet,
        updated_at: candidate.updated_at,
        relevance,
      })),
    },
  };
}