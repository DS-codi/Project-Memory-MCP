/**
 * Tests for skill-phase-matcher.ts
 *
 * Covers:
 * 1. Matching skills to phases by keyword overlap
 * 2. Unmatched phases when no skills match
 * 3. Multi-phase plans with different skill matches per phase
 * 4. Empty registry returns all phases unmatched
 * 5. Single-step matching via matchSkillsToStep
 */

import { describe, it, expect } from 'vitest';
import type { SkillRegistryIndex, SkillRegistryEntry } from '../../types/skill.types.js';
import type { PlanStep } from '../../types/plan.types.js';
import {
  matchSkillsToPhases,
  matchSkillsToStep,
  extractKeywordsFromText,
} from '../../tools/skill-phase-matcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(name: string, keywords: string[]): SkillRegistryEntry {
  return {
    name,
    file_path: `/skills/${name}/SKILL.md`,
    category: 'general',
    tags: [],
    keywords,
  };
}

function makeRegistry(entries: SkillRegistryEntry[]): SkillRegistryIndex {
  const keyword_map = new Map<string, string[]>();
  for (const entry of entries) {
    for (const kw of entry.keywords) {
      const existing = keyword_map.get(kw);
      if (existing) {
        if (!existing.includes(entry.name)) existing.push(entry.name);
      } else {
        keyword_map.set(kw, [entry.name]);
      }
    }
  }
  return {
    entries,
    keyword_map,
    workspace_path: '/test/workspace',
    built_at: new Date().toISOString(),
  };
}

function makeStep(phase: string, task: string, index = 0): PlanStep {
  return { phase, task, index, status: 'pending' };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractKeywordsFromText', () => {
  it('should extract meaningful keywords and skip stop-words', () => {
    const kws = extractKeywordsFromText('Implement the authentication middleware for the API');
    expect(kws).toContain('implement');
    expect(kws).toContain('authentication');
    expect(kws).toContain('middleware');
    expect(kws).toContain('api');
    expect(kws).not.toContain('the');
    expect(kws).not.toContain('for');
  });

  it('should skip tokens shorter than 3 chars', () => {
    const kws = extractKeywordsFromText('go to db');
    expect(kws).not.toContain('go');
    expect(kws).not.toContain('to');
    expect(kws).not.toContain('db');
  });
});

describe('matchSkillsToStep', () => {
  it('should match a skill when keywords overlap with step task', () => {
    const registry = makeRegistry([
      makeEntry('react-components', ['react', 'components', 'frontend', 'hooks']),
    ]);
    const step = makeStep('Phase 1', 'Create React components with hooks');
    const matches = matchSkillsToStep(registry, step);

    expect(matches.length).toBe(1);
    expect(matches[0].skill_name).toBe('react-components');
    expect(matches[0].relevance_score).toBeGreaterThan(0);
    expect(matches[0].matched_keywords).toContain('react');
    expect(matches[0].matched_keywords).toContain('components');
    expect(matches[0].matched_keywords).toContain('hooks');
  });

  it('should return empty array when no keywords match', () => {
    const registry = makeRegistry([
      makeEntry('database-patterns', ['database', 'sql', 'postgresql']),
    ]);
    const step = makeStep('Phase 1', 'Create React components with hooks');
    const matches = matchSkillsToStep(registry, step);

    expect(matches).toEqual([]);
  });

  it('should return empty array for empty registry', () => {
    const registry = makeRegistry([]);
    const step = makeStep('Phase 1', 'Create React components');
    const matches = matchSkillsToStep(registry, step);

    expect(matches).toEqual([]);
  });
});

describe('matchSkillsToPhases', () => {
  it('should match skills to phases by keyword overlap', () => {
    const registry = makeRegistry([
      makeEntry('react-components', ['react', 'components', 'frontend', 'hooks']),
      makeEntry('testing-patterns', ['testing', 'vitest', 'test', 'coverage']),
    ]);
    const steps = [
      makeStep('Phase 1: Setup', 'Install React and set up frontend components', 0),
      makeStep('Phase 1: Setup', 'Configure hooks and component architecture', 1),
      makeStep('Phase 2: Testing', 'Write vitest tests with full coverage', 2),
    ];

    const result = matchSkillsToPhases(registry, steps);

    expect(result.phase_matches['Phase 1: Setup'].length).toBeGreaterThan(0);
    expect(result.phase_matches['Phase 1: Setup'][0].skill_name).toBe('react-components');

    expect(result.phase_matches['Phase 2: Testing'].length).toBeGreaterThan(0);
    expect(result.phase_matches['Phase 2: Testing'][0].skill_name).toBe('testing-patterns');

    expect(result.total_skills_matched).toBe(2);
    expect(result.unmatched_phases).toEqual([]);
  });

  it('should report unmatched phases when no skills match', () => {
    const registry = makeRegistry([
      makeEntry('react-components', ['react', 'components', 'frontend']),
    ]);
    const steps = [
      makeStep('Phase 1: Database', 'Set up PostgreSQL with migrations', 0),
      makeStep('Phase 2: Deploy', 'Deploy to production server', 1),
    ];

    const result = matchSkillsToPhases(registry, steps);

    expect(result.unmatched_phases).toContain('Phase 1: Database');
    expect(result.unmatched_phases).toContain('Phase 2: Deploy');
    expect(result.total_skills_matched).toBe(0);
  });

  it('should handle multi-phase plans with different skill matches per phase', () => {
    const registry = makeRegistry([
      makeEntry('react-components', ['react', 'components', 'frontend']),
      makeEntry('database-patterns', ['database', 'postgresql', 'migrations', 'schema']),
      makeEntry('testing-patterns', ['testing', 'vitest', 'coverage']),
    ]);
    const steps = [
      makeStep('Phase 1: Frontend', 'Build React frontend components', 0),
      makeStep('Phase 2: Backend', 'Set up PostgreSQL database schema and migrations', 1),
      makeStep('Phase 3: Testing', 'Write vitest tests for coverage', 2),
      makeStep('Phase 4: Docs', 'Write user documentation', 3),
    ];

    const result = matchSkillsToPhases(registry, steps);

    // Phase 1 should match react
    expect(result.phase_matches['Phase 1: Frontend'].some(m => m.skill_name === 'react-components')).toBe(true);

    // Phase 2 should match database
    expect(result.phase_matches['Phase 2: Backend'].some(m => m.skill_name === 'database-patterns')).toBe(true);

    // Phase 3 should match testing
    expect(result.phase_matches['Phase 3: Testing'].some(m => m.skill_name === 'testing-patterns')).toBe(true);

    // Phase 4 (Docs) should be unmatched
    expect(result.unmatched_phases).toContain('Phase 4: Docs');

    expect(result.total_skills_matched).toBe(3);
  });

  it('should return all phases unmatched for empty registry', () => {
    const registry = makeRegistry([]);
    const steps = [
      makeStep('Phase 1: Setup', 'Install dependencies', 0),
      makeStep('Phase 2: Build', 'Build the application', 1),
      makeStep('Phase 3: Test', 'Run tests', 2),
    ];

    const result = matchSkillsToPhases(registry, steps);

    expect(result.unmatched_phases).toEqual([
      'Phase 1: Setup',
      'Phase 2: Build',
      'Phase 3: Test',
    ]);
    expect(result.total_skills_matched).toBe(0);
    expect(Object.keys(result.phase_matches)).toHaveLength(3);
    for (const matches of Object.values(result.phase_matches)) {
      expect(matches).toEqual([]);
    }
  });

  it('should accept explicit PlanPhase objects', () => {
    const registry = makeRegistry([
      makeEntry('react-components', ['react', 'components']),
    ]);
    const steps = [
      makeStep('Phase 1: UI', 'Create React components', 0),
    ];
    const phases = [{
      name: 'Phase 1: UI',
      sequence: 1,
      success_criteria: [],
      required_agents: [],
      context_files: [],
      linked_skills: [],
      approval_required: false,
      estimated_steps: 1,
      auto_continue_eligible: false,
    }];

    const result = matchSkillsToPhases(registry, steps, phases);

    expect(result.phase_matches['Phase 1: UI'].length).toBeGreaterThan(0);
    expect(result.phase_matches['Phase 1: UI'][0].skill_name).toBe('react-components');
  });

  it('should deduplicate skills matched across multiple steps in a phase', () => {
    const registry = makeRegistry([
      makeEntry('react-components', ['react', 'components', 'hooks']),
    ]);
    const steps = [
      makeStep('Phase 1', 'Create React components', 0),
      makeStep('Phase 1', 'Add hooks to React components', 1),
    ];

    const result = matchSkillsToPhases(registry, steps);

    // Should appear only once per phase
    const reactMatches = result.phase_matches['Phase 1'].filter(
      m => m.skill_name === 'react-components',
    );
    expect(reactMatches).toHaveLength(1);
    expect(result.total_skills_matched).toBe(1);
  });
});
