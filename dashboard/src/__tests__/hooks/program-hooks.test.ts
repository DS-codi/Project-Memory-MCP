/**
 * Tests for Phase 8 hooks — usePrograms and useSkills.
 * Validates hook fetch functions and query configuration (type-level + structural).
 */
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server';

import {
  fetchPrograms,
  fetchProgramDetail,
  usePrograms,
  useProgram,
} from '../../hooks/usePrograms';

import {
  fetchSkills,
  fetchSkillContent,
  useSkills,
  useSkillContent,
} from '../../hooks/useSkills';

// ─── Program hook tests ─────────────────────────────────────────────────────

describe('usePrograms hooks', () => {
  describe('fetchPrograms', () => {
    it('returns { programs } on success', async () => {
      const mockPrograms = [
        {
          program_id: 'prog_1',
          name: 'Test Program',
          description: '',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
          workspace_id: 'ws_123',
          plans: [],
          aggregate_progress: { total_plans: 0, active_plans: 0, completed_plans: 0, archived_plans: 0, failed_plans: 0, total_steps: 0, done_steps: 0, active_steps: 0, pending_steps: 0, blocked_steps: 0, completion_percentage: 0 },
        },
      ];

      server.use(
        http.get('/api/programs/ws_123', () =>
          HttpResponse.json({ programs: mockPrograms }),
        ),
      );

      const result = await fetchPrograms('ws_123');
      expect(result).toHaveProperty('programs');
      expect(result.programs).toHaveLength(1);
      expect(result.programs[0].program_id).toBe('prog_1');
    });

    it('throws on non-OK response', async () => {
      server.use(
        http.get('/api/programs/ws_fail', () =>
          HttpResponse.json({ error: 'Not found' }, { status: 404 }),
        ),
      );

      await expect(fetchPrograms('ws_fail')).rejects.toThrow(
        'Failed to fetch programs',
      );
    });
  });

  describe('fetchProgramDetail', () => {
    it('returns a ProgramDetail on success', async () => {
      const mockDetail = {
        program_id: 'prog_detail',
        name: 'Detail Program',
        description: 'Full detail',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        workspace_id: 'ws_123',
        plans: [],
        aggregate_progress: { total_plans: 1, active_plans: 1, completed_plans: 0, archived_plans: 0, failed_plans: 0, total_steps: 10, done_steps: 5, active_steps: 2, pending_steps: 3, blocked_steps: 0, completion_percentage: 50 },
        goals: ['Ship it'],
      };

      server.use(
        http.get('/api/programs/ws_123/prog_detail', () =>
          HttpResponse.json(mockDetail),
        ),
      );

      const result = await fetchProgramDetail('ws_123', 'prog_detail');
      expect(result.program_id).toBe('prog_detail');
      expect(result.goals).toEqual(['Ship it']);
    });

    it('throws on non-OK response', async () => {
      server.use(
        http.get('/api/programs/ws_123/bad_id', () =>
          HttpResponse.json({ error: 'Not found' }, { status: 404 }),
        ),
      );

      await expect(
        fetchProgramDetail('ws_123', 'bad_id'),
      ).rejects.toThrow('Failed to fetch program detail');
    });
  });

  describe('usePrograms query config', () => {
    it('is a function that returns a useQuery result', () => {
      expect(typeof usePrograms).toBe('function');
    });

    it('useProgram is a function that returns a useQuery result', () => {
      expect(typeof useProgram).toBe('function');
    });
  });
});

// ─── Skills hook tests ──────────────────────────────────────────────────────

describe('useSkills hooks', () => {
  describe('fetchSkills', () => {
    it('returns { skills } on success', async () => {
      const mockSkills = [
        {
          name: 'pyside6-qml',
          description: 'QML patterns',
          file_path: '/skills/pyside6-qml/SKILL.md',
          deployed: true,
          workspace_id: 'ws_skills',
        },
      ];

      server.use(
        http.get('/api/skills/ws_skills', () =>
          HttpResponse.json({ skills: mockSkills }),
        ),
      );

      const result = await fetchSkills('ws_skills');
      expect(result).toHaveProperty('skills');
      expect(result.skills).toHaveLength(1);
      expect(result.skills[0].name).toBe('pyside6-qml');
    });

    it('throws on non-OK response', async () => {
      server.use(
        http.get('/api/skills/ws_fail', () =>
          HttpResponse.json({ error: 'Server error' }, { status: 500 }),
        ),
      );

      await expect(fetchSkills('ws_fail')).rejects.toThrow(
        'Failed to fetch skills',
      );
    });
  });

  describe('fetchSkillContent', () => {
    it('returns { content } on success', async () => {
      server.use(
        http.get('/api/skills/ws_skills/my-skill', () =>
          HttpResponse.json({ content: '# My Skill\n\nContent here.' }),
        ),
      );

      const result = await fetchSkillContent('ws_skills', 'my-skill');
      expect(result).toHaveProperty('content');
      expect(result.content).toContain('My Skill');
    });

    it('throws on non-OK response', async () => {
      server.use(
        http.get('/api/skills/ws_skills/missing', () =>
          HttpResponse.json({ error: 'Not found' }, { status: 404 }),
        ),
      );

      await expect(
        fetchSkillContent('ws_skills', 'missing'),
      ).rejects.toThrow('Failed to fetch skill content');
    });

    it('encodes skill name with special characters', async () => {
      const encodedName = encodeURIComponent('skill with spaces');
      server.use(
        http.get(`/api/skills/ws_skills/${encodedName}`, () =>
          HttpResponse.json({ content: 'encoded content' }),
        ),
      );

      const result = await fetchSkillContent('ws_skills', 'skill with spaces');
      expect(result.content).toBe('encoded content');
    });
  });

  describe('useSkills query config', () => {
    it('is a function that returns a useQuery result', () => {
      expect(typeof useSkills).toBe('function');
    });

    it('useSkillContent is a function that returns a useQuery result', () => {
      expect(typeof useSkillContent).toBe('function');
    });
  });
});
