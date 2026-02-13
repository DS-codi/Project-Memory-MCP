/**
 * Workspace Type Definitions
 *
 * Types for workspace metadata, profiles, context, and indexing.
 */

import type { BuildScript } from './build.types.js';

// =============================================================================
// Workspace Metadata (workspace.meta.json)
// =============================================================================

export interface WorkspaceMeta {
  schema_version?: string;
  workspace_id: string;
  workspace_path?: string;
  path: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  registered_at: string;
  last_accessed: string;
  last_seen_at?: string;
  data_root?: string;
  legacy_workspace_ids?: string[];
  source?: string;
  status?: string;
  active_plans: string[];
  archived_plans: string[];
  active_programs: string[];  // IDs of active Integrated Programs
  indexed: boolean;  // Whether codebase has been indexed
  profile?: WorkspaceProfile;  // Codebase profile from indexing
  workspace_build_scripts?: BuildScript[];  // Workspace-level build scripts
  parent_workspace_id?: string;  // ID of the parent workspace (if this is a child)
  child_workspace_ids?: string[];  // IDs of child workspaces (if this is a parent)
  hierarchy_linked_at?: string;  // ISO timestamp of when the hierarchy link was established
}

// =============================================================================
// Workspace Context (workspace.context.json)
// =============================================================================

export interface WorkspaceContextSectionItem {
  title: string;
  description?: string;
  links?: string[];
}

export interface WorkspaceContextSection {
  summary?: string;
  items?: WorkspaceContextSectionItem[];
}

export interface WorkspaceContext {
  schema_version: string;
  workspace_id: string;
  workspace_path: string;
  identity_file_path?: string;
  name: string;
  created_at: string;
  updated_at: string;
  sections: Record<string, WorkspaceContextSection>;
  update_log?: WorkspaceUpdateLog;
  audit_log?: WorkspaceAuditLog;
}

export interface WorkspaceUpdateLogEntry {
  timestamp: string;
  tool: string;
  action?: string;
  file_path: string;
  summary: string;
  plan_id?: string;
  agent?: string;
  untracked?: boolean;
  warning?: string;
}

export interface WorkspaceUpdateLog {
  entries: WorkspaceUpdateLogEntry[];
  last_updated: string;
}

export interface WorkspaceAuditEntry {
  timestamp: string;
  tool: string;
  action?: string;
  file_path: string;
  summary: string;
  plan_id?: string;
  agent?: string;
  warning: string;
}

export interface WorkspaceAuditLog {
  entries: WorkspaceAuditEntry[];
  last_updated: string;
}

// =============================================================================
// Workspace Profile - Created on first-time indexing
// =============================================================================

export interface WorkspaceProfile {
  indexed_at: string;
  languages: LanguageInfo[];
  frameworks: string[];
  build_system?: BuildSystemInfo;
  test_framework?: TestFrameworkInfo;
  package_manager?: string;
  key_directories: DirectoryInfo[];
  conventions: CodingConventions;
  total_files: number;
  total_lines: number;
}

export interface LanguageInfo {
  name: string;
  percentage: number;
  file_count: number;
  extensions: string[];
}

export interface BuildSystemInfo {
  type: string;  // 'npm', 'yarn', 'pnpm', 'cargo', 'gradle', 'maven', 'make', etc.
  config_file: string;
  build_command?: string;
  dev_command?: string;
}

export interface TestFrameworkInfo {
  name: string;  // 'jest', 'vitest', 'pytest', 'junit', etc.
  config_file?: string;
  test_command?: string;
  test_directory?: string;
}

export interface DirectoryInfo {
  path: string;
  purpose: string;  // 'source', 'tests', 'config', 'docs', 'assets', etc.
  file_count: number;
}

export interface CodingConventions {
  indentation?: 'tabs' | 'spaces';
  indent_size?: number;
  quote_style?: 'single' | 'double';
  semicolons?: boolean;
  trailing_commas?: boolean;
  line_endings?: 'lf' | 'crlf';
  max_line_length?: number;
}

// =============================================================================
// Workspace Context Summary (for agent init - lightweight section overview)
// =============================================================================

export interface WorkspaceContextSectionSummary {
  summary?: string;
  item_count: number;
}

export interface KnowledgeFileSummary {
  slug: string;
  title: string;
  category: string;
  updated_at: string;
}

export interface WorkspaceContextSummary {
  sections: Record<string, WorkspaceContextSectionSummary>;
  updated_at?: string;
  stale_context_warning?: string;  // Warning if context is >30 days old
  knowledge_files?: KnowledgeFileSummary[];             // All knowledge files (slug, title, category, updated_at)
  stale_knowledge_files?: { slug: string; title: string; days_old: number }[];  // Knowledge files >60 days old
}

// =============================================================================
// Workspace Overlap Detection (Parent-Child Hierarchy)
// =============================================================================

export interface WorkspaceOverlapInfo {
  overlap_detected: boolean;
  relationship: 'parent' | 'child' | 'none';
  existing_workspace_id: string;
  existing_workspace_path: string;
  existing_workspace_name: string;
  suggested_action: 'link' | 'abort' | 'force';
  message: string;
}
