/**
 * Skill definition storage with tag/category/framework matching.
 */

import type { SkillDefinitionRow } from './types.js';
import { queryOne, queryAll, run, newId, nowIso } from './query-helpers.js';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface StoreSkillData {
  category?:          string | null;
  tags?:              string[] | null;
  language_targets?:  string[] | null;
  framework_targets?: string[] | null;
  content:            string;
  description?:       string | null;
}

export function storeSkill(name: string, data: StoreSkillData): void {
  const now = nowIso();
  const existing = getSkill(name);

  const tagsJson      = data.tags              ? JSON.stringify(data.tags)              : null;
  const langJson      = data.language_targets  ? JSON.stringify(data.language_targets)  : null;
  const frameworkJson = data.framework_targets ? JSON.stringify(data.framework_targets) : null;

  if (existing) {
    run(
      `UPDATE skill_definitions
       SET category = ?, tags = ?, language_targets = ?, framework_targets = ?,
           content = ?, description = ?, updated_at = ?
       WHERE id = ?`,
      [
        data.category ?? null, tagsJson, langJson, frameworkJson,
        data.content, data.description ?? null, now,
        existing.id,
      ]
    );
  } else {
    run(
      `INSERT INTO skill_definitions
        (id, name, category, tags, language_targets, framework_targets, content, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(), name,
        data.category ?? null, tagsJson, langJson, frameworkJson,
        data.content, data.description ?? null, now, now,
      ]
    );
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export function getSkill(name: string): SkillDefinitionRow | null {
  return queryOne<SkillDefinitionRow>(
    'SELECT * FROM skill_definitions WHERE name = ?',
    [name]
  ) ?? null;
}

export function listSkills(category?: string): SkillDefinitionRow[] {
  if (category) {
    return queryAll<SkillDefinitionRow>(
      'SELECT * FROM skill_definitions WHERE category = ? ORDER BY name',
      [category]
    );
  }
  return queryAll<SkillDefinitionRow>('SELECT * FROM skill_definitions ORDER BY name');
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export interface MatchSkillsOptions {
  category?:          string;
  tags?:              string[];
  language_targets?:  string[];
  framework_targets?: string[];
  limit?:             number;
}

/**
 * Return skills that match the given criteria.
 *
 * Scoring: +1 for each matching tag/language/framework/category.
 * Returns the top `limit` results (default 10) sorted by score descending.
 */
export function matchSkills(query: string, opts: MatchSkillsOptions = {}): SkillDefinitionRow[] {
  const all = listSkills();
  const queryLower = query.toLowerCase();

  type Scored = { score: number; row: SkillDefinitionRow };

  const scored: Scored[] = all
    .map(row => {
      let score = 0;

      // Text match in name / description / content
      if (row.name.toLowerCase().includes(queryLower))        score += 3;
      if (row.description?.toLowerCase().includes(queryLower)) score += 2;
      if (row.content.toLowerCase().includes(queryLower))     score += 1;

      // Category match
      if (opts.category && row.category === opts.category) score += 2;

      // Tag overlap
      if (opts.tags && row.tags) {
        const rowTags: string[] = JSON.parse(row.tags);
        for (const t of opts.tags) {
          if (rowTags.map(s => s.toLowerCase()).includes(t.toLowerCase())) score += 1;
        }
      }

      // Language match
      if (opts.language_targets && row.language_targets) {
        const rowLangs: string[] = JSON.parse(row.language_targets);
        for (const l of opts.language_targets) {
          if (rowLangs.map(s => s.toLowerCase()).includes(l.toLowerCase())) score += 1;
        }
      }

      // Framework match
      if (opts.framework_targets && row.framework_targets) {
        const rowFw: string[] = JSON.parse(row.framework_targets);
        for (const f of opts.framework_targets) {
          if (rowFw.map(s => s.toLowerCase()).includes(f.toLowerCase())) score += 1;
        }
      }

      return { score, row };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, opts.limit ?? 10).map(s => s.row);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export function deleteSkill(name: string): void {
  run('DELETE FROM skill_definitions WHERE name = ?', [name]);
}
