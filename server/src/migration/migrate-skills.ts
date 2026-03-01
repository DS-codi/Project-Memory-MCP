/**
 * migration/migrate-skills.ts — Phase 9.3: Skill Definition Seeding
 *
 * Reads all SKILL.md files from .github/skills/{name}/SKILL.md and inserts
 * them into the `skill_definitions` table.
 */

import fs   from 'node:fs';
import path from 'node:path';

import { storeSkill }         from '../db/skill-db.js';
import type { ReportBuilder } from './report.js';

function resolveSkillsDir(projectRoot: string): string | null {
  const override = process.env.MBS_SKILLS_ROOT;
  if (override && fs.existsSync(override)) {
    return override;
  }

  const roots = [
    projectRoot,
    path.resolve(projectRoot, '..'),
    path.resolve(projectRoot, '..', '..'),
  ];

  for (const root of roots) {
    const githubSkills = path.join(root, '.github', 'skills');
    if (fs.existsSync(githubSkills)) {
      return githubSkills;
    }
    const legacySkills = path.join(root, 'skills');
    if (fs.existsSync(legacySkills)) {
      return legacySkills;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function migrateSkills(projectRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 9.3: Skill Definition Seeding');

  const skillsDir = resolveSkillsDir(projectRoot);
  if (!skillsDir) {
    report.skip('.github/skills/', 'directory not found (including parent root fallback)');
    return;
  }

  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const skillName of skillDirs) {
    const skillFile = path.join(skillsDir, skillName, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      report.skip(`skills/${skillName}`, 'no SKILL.md');
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(skillFile, 'utf-8');
    } catch (err) {
      report.error(skillFile, `read error: ${(err as Error).message}`);
      continue;
    }

    const meta = extractSkillMeta(content, skillName);

    if (!dryRun) {
      try {
        storeSkill(skillName, {
          category:          meta.category,
          tags:              meta.tags,
          language_targets:  meta.languageTargets,
          framework_targets: meta.frameworkTargets,
          content,
        });
      } catch (err) {
        report.error(skillFile, `DB insert failed: ${(err as Error).message}`);
        continue;
      }
    }
    report.increment('skills');
  }
}

// ---------------------------------------------------------------------------
// Frontmatter parser for SKILL.md
// ---------------------------------------------------------------------------

interface SkillMeta {
  category:         string;
  tags:             string[];
  languageTargets:  string[];
  frameworkTargets: string[];
}

function extractSkillMeta(content: string, skillName: string): SkillMeta {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return { category: 'general', tags: [skillName], languageTargets: [], frameworkTargets: [] };
  }

  const meta: Record<string, unknown> = {};
  const lines = frontmatterMatch[1].split('\n');
  let currentKey = '';

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && !line.trimStart().startsWith('-')) {
      currentKey = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (value) meta[currentKey] = value;
      else       meta[currentKey] = [];
    } else if (line.trimStart().startsWith('-') && currentKey) {
      const item = line.replace(/^\s*-\s*/, '').trim();
      if (!Array.isArray(meta[currentKey])) meta[currentKey] = [];
      (meta[currentKey] as string[]).push(item);
    }
  }

  return {
    category:         (meta['category'] as string) ?? 'general',
    tags:             toStringArray(meta['tags']),
    languageTargets:  toStringArray(meta['language_targets']),
    frameworkTargets: toStringArray(meta['framework_targets']),
  };
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string' && val) return [val];
  return [];
}
