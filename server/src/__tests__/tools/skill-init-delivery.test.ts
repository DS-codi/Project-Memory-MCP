/**
 * Tests for init-time skill delivery via cached registry.
 *
 * Covers:
 * 1. Init returns matched skills from cached registry
 * 2. Phase-linked skills get boosted scores
 * 3. include_skills=false returns no skills
 * 4. Missing skills directory returns empty array
 * 5. Cache is used on repeated inits (no redundant rebuilds)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SkillRegistryIndex, SkillRegistryEntry } from '../../types/skill.types.js';
import type { PlanStep, PlanPhase } from '../../types/plan.types.js';
import type { MatchedSkillEntry } from '../../types/common.types.js';
import { matchSkillsToStep } from '../../tools/skill-phase-matcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(name: string, keywords: string[], filePath?: string): SkillRegistryEntry {
  return {
    name,
    file_path: filePath ?? `/skills/${name}/SKILL.md`,
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

function makeStep(phase: string, task: string, status: PlanStep['status'] = 'pending'): PlanStep {
  return { phase, task, index: 0, status };
}

/**
 * Simulate the init-time skill matching logic from handoff.tools.ts
 * This mirrors the refactored code without needing the full init pipeline.
 */
function simulateInitSkillMatching(params: {
  registry: SkillRegistryIndex;
  planTitle: string;
  currentPhase: string;
  steps: PlanStep[];
  phases?: PlanPhase[];
  agentType?: string;
  includeSkills?: boolean;
}): MatchedSkillEntry[] | undefined {
  if (params.includeSkills === false) return undefined;

  const { registry, planTitle, currentPhase, steps, phases, agentType } = params;
  if (registry.entries.length === 0) return undefined;

  // Build context parts (mirrors handoff.tools.ts logic)
  const contextParts = [
    planTitle,
    currentPhase,
    ...steps
      .filter(s => s.status === 'active' || s.status === 'pending')
      .slice(0, 5)
      .map(s => s.task),
  ];

  if (agentType === 'TDDDriver') {
    contextParts.push('testing', 'tdd', 'test-driven development', 'unit test', 'test framework', 'red green refactor');
  }

  const syntheticStep = {
    phase: currentPhase || '',
    task: contextParts.filter(Boolean).join(' '),
    index: 0,
    status: 'active' as const,
  };

  const matches = matchSkillsToStep(registry, syntheticStep);
  if (matches.length === 0) return undefined;

  // Phase-linked boost
  const currentPhaseDef = phases?.find(p => p.name === currentPhase);
  const phaseLinkedSkills = new Set(currentPhaseDef?.linked_skills ?? []);

  const entries: MatchedSkillEntry[] = matches.slice(0, 5).map((m) => {
    const isPhaseLinked = phaseLinkedSkills.has(m.skill_name);
    return {
      skill_name: m.skill_name,
      relevance_score: isPhaseLinked
        ? Math.round(Math.min(m.relevance_score + 0.2, 1.0) * 1000) / 1000
        : m.relevance_score,
      matched_keywords: m.matched_keywords,
      phase_linked: isPhaseLinked || undefined,
    };
  });

  entries.sort((a, b) => b.relevance_score - a.relevance_score);
  return entries;
}

function makePhase(name: string, linkedSkills: string[]): PlanPhase {
  return {
    name,
    sequence: 1,
    success_criteria: [],
    required_agents: [],
    context_files: [],
    linked_skills: linkedSkills,
    approval_required: false,
    estimated_steps: 3,
    auto_continue_eligible: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Init-time skill delivery', () => {
  describe('matched skills from cached registry', () => {
    it('returns matched skills when registry has relevant entries', () => {
      const registry = makeRegistry([
        makeEntry('react-components', ['react', 'components', 'hooks', 'frontend']),
        makeEntry('typescript-testing', ['typescript', 'testing', 'vitest', 'unit']),
      ]);

      const result = simulateInitSkillMatching({
        registry,
        planTitle: 'Add React component tests',
        currentPhase: 'Phase 1: Testing',
        steps: [
          makeStep('Phase 1: Testing', 'Write unit tests for React components using vitest'),
        ],
      });

      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThan(0);
      // Both skills should match since we mention react, components, testing, vitest
      const skillNames = result!.map(s => s.skill_name);
      expect(skillNames).toContain('react-components');
      expect(skillNames).toContain('typescript-testing');
    });

    it('returns skills sorted by relevance_score descending', () => {
      const registry = makeRegistry([
        makeEntry('react-components', ['react', 'components', 'hooks']),
        makeEntry('mvc-architecture', ['mvc', 'architecture', 'model', 'view', 'controller']),
      ]);

      const result = simulateInitSkillMatching({
        registry,
        planTitle: 'Build React dashboard',
        currentPhase: 'Phase 1',
        steps: [
          makeStep('Phase 1', 'Create React components for dashboard'),
        ],
      });

      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThan(0);
      for (let i = 1; i < result!.length; i++) {
        expect(result![i - 1].relevance_score).toBeGreaterThanOrEqual(result![i].relevance_score);
      }
    });
  });

  describe('phase-linked skills get boosted scores', () => {
    it('boosts relevance_score by 0.2 for phase-linked skills', () => {
      const registry = makeRegistry([
        makeEntry('react-components', ['react', 'components', 'frontend']),
        makeEntry('typescript-testing', ['typescript', 'testing', 'vitest']),
      ]);

      const phases = [
        makePhase('Phase 1: Implementation', ['react-components']),
      ];

      // Without phase link
      const withoutPhase = simulateInitSkillMatching({
        registry,
        planTitle: 'React feature',
        currentPhase: 'Phase 1: Implementation',
        steps: [makeStep('Phase 1: Implementation', 'Create React frontend components')],
      });

      // With phase link
      const withPhase = simulateInitSkillMatching({
        registry,
        planTitle: 'React feature',
        currentPhase: 'Phase 1: Implementation',
        steps: [makeStep('Phase 1: Implementation', 'Create React frontend components')],
        phases,
      });

      expect(withoutPhase).toBeDefined();
      expect(withPhase).toBeDefined();

      const reactWithout = withoutPhase!.find(s => s.skill_name === 'react-components');
      const reactWith = withPhase!.find(s => s.skill_name === 'react-components');

      expect(reactWithout).toBeDefined();
      expect(reactWith).toBeDefined();
      expect(reactWith!.phase_linked).toBe(true);
      expect(reactWith!.relevance_score).toBeCloseTo(
        Math.min(reactWithout!.relevance_score + 0.2, 1.0),
        2
      );
    });

    it('sets phase_linked flag only on linked skills', () => {
      const registry = makeRegistry([
        makeEntry('react-components', ['react', 'components', 'frontend']),
        makeEntry('typescript-testing', ['typescript', 'testing', 'vitest', 'react']),
      ]);

      const phases = [
        makePhase('Phase 1: Implementation', ['react-components']),
      ];

      const result = simulateInitSkillMatching({
        registry,
        planTitle: 'React feature',
        currentPhase: 'Phase 1: Implementation',
        steps: [makeStep('Phase 1: Implementation', 'Build React components with typescript testing')],
        phases,
      });

      expect(result).toBeDefined();
      const react = result!.find(s => s.skill_name === 'react-components');
      const testing = result!.find(s => s.skill_name === 'typescript-testing');

      expect(react?.phase_linked).toBe(true);
      expect(testing?.phase_linked).toBeUndefined();
    });

    it('caps boosted score at 1.0', () => {
      // Create a skill with many overlapping keywords to get high base score
      const keywords = ['alpha', 'beta', 'gamma'];
      const registry = makeRegistry([
        makeEntry('high-score-skill', keywords),
      ]);

      const phases = [
        makePhase('Phase 1', ['high-score-skill']),
      ];

      const result = simulateInitSkillMatching({
        registry,
        planTitle: 'alpha beta gamma',
        currentPhase: 'Phase 1',
        steps: [makeStep('Phase 1', 'alpha beta gamma work')],
        phases,
      });

      expect(result).toBeDefined();
      const skill = result!.find(s => s.skill_name === 'high-score-skill');
      expect(skill).toBeDefined();
      expect(skill!.relevance_score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('include_skills=false returns no skills', () => {
    it('returns undefined when include_skills is false', () => {
      const registry = makeRegistry([
        makeEntry('react-components', ['react', 'components']),
      ]);

      const result = simulateInitSkillMatching({
        registry,
        planTitle: 'React project',
        currentPhase: 'Phase 1',
        steps: [makeStep('Phase 1', 'Build React components')],
        includeSkills: false,
      });

      expect(result).toBeUndefined();
    });

    it('returns skills when include_skills is undefined (default behavior)', () => {
      const registry = makeRegistry([
        makeEntry('react-components', ['react', 'components']),
      ]);

      const result = simulateInitSkillMatching({
        registry,
        planTitle: 'React project',
        currentPhase: 'Phase 1',
        steps: [makeStep('Phase 1', 'Build React components')],
        includeSkills: undefined,
      });

      expect(result).toBeDefined();
    });
  });

  describe('missing skills directory returns empty', () => {
    it('returns undefined when registry has no entries', () => {
      const emptyRegistry = makeRegistry([]);

      const result = simulateInitSkillMatching({
        registry: emptyRegistry,
        planTitle: 'Some project',
        currentPhase: 'Phase 1',
        steps: [makeStep('Phase 1', 'Do some work')],
      });

      expect(result).toBeUndefined();
    });
  });

  describe('cache is used on repeated inits', () => {
    it('buildSkillRegistry returns cached index when directory exists', async () => {
      const { buildSkillRegistry, invalidateSkillRegistryCache } = await import('../../tools/skill-registry.js');
      const fsp = await import('fs/promises');
      const os = await import('os');
      const path = await import('path');

      // Create a temp workspace with an empty .github/skills directory
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'skill-cache-test-'));
      const skillsDir = path.join(tmpDir, '.github', 'skills');
      await fsp.mkdir(skillsDir, { recursive: true });

      // Ensure cache is clear
      invalidateSkillRegistryCache(tmpDir);

      // First call — builds fresh (empty skills dir)
      const first = await buildSkillRegistry(tmpDir);
      expect(first.entries).toHaveLength(0);

      // Second call — should return cached (same ref)
      const second = await buildSkillRegistry(tmpDir);
      expect(second).toBe(first); // Same object reference = cache hit

      // Cleanup
      invalidateSkillRegistryCache(tmpDir);
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    it('invalidateSkillRegistryCache forces rebuild', async () => {
      const { buildSkillRegistry, invalidateSkillRegistryCache } = await import('../../tools/skill-registry.js');
      const fsp = await import('fs/promises');
      const os = await import('os');
      const path = await import('path');

      // Create a temp workspace with an empty .github/skills directory
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'skill-inval-test-'));
      const skillsDir = path.join(tmpDir, '.github', 'skills');
      await fsp.mkdir(skillsDir, { recursive: true });

      invalidateSkillRegistryCache(tmpDir);

      const first = await buildSkillRegistry(tmpDir);
      invalidateSkillRegistryCache(tmpDir);
      const second = await buildSkillRegistry(tmpDir);

      // After invalidation, a new object is built (different ref)
      expect(second).not.toBe(first);

      // Cleanup
      invalidateSkillRegistryCache(tmpDir);
      await fsp.rm(tmpDir, { recursive: true, force: true });
    });
  });
});
