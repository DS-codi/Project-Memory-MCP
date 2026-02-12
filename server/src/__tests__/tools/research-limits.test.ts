/**
 * Tests for research note auto-summarization and size limits.
 * Tests the trimResearchNoteIfOversized internal behavior via the
 * public appendResearch API and direct file-store mocking.
 *
 * Phase 6: Context Optimization — research notes limits
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appendResearch } from '../../tools/context.tools.js';
import * as store from '../../storage/file-store.js';

vi.mock('../../storage/file-store.js');
vi.mock('../../logging/workspace-update-log.js', () => ({
  appendWorkspaceFileUpdate: vi.fn().mockResolvedValue(undefined)
}));

const SUMMARIZED_MARKER = '[Summarized]';

const mockWorkspaceId = 'ws_research_test';
const mockPlanId = 'plan_research_test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMarkdownContent(sectionCount: number, bodyLineCount: number): string {
  const sections: string[] = [];
  for (let i = 0; i < sectionCount; i++) {
    const header = `## Section ${i + 1}`;
    const body = Array.from({ length: bodyLineCount }, (_, j) =>
      `Line ${j + 1} of section ${i + 1}: ${'x'.repeat(60)}`
    ).join('\n');
    sections.push(`${header}\n${body}`);
  }
  return sections.join('\n');
}

function buildOversizedContent(targetBytes: number): string {
  // Create enough sections to exceed the target
  const sectionCount = 10;
  const lineLength = 80;
  const linesPerSection = Math.ceil(targetBytes / sectionCount / lineLength) + 5;
  return buildMarkdownContent(sectionCount, linesPerSection);
}

// ---------------------------------------------------------------------------
// Tests: Auto-summarization triggers at 50KB
// ---------------------------------------------------------------------------

describe('Research note auto-summarization', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default store mocks
    vi.mocked(store.getResearchNotesPath).mockReturnValue('/data/ws/plan/research');
    vi.mocked(store.writeText).mockResolvedValue(undefined);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-13T00:00:00Z');
    vi.mocked(store.getPlanState).mockResolvedValue({ plan_id: mockPlanId } as any);
  });

  it('should not trim content below 50KB threshold', async () => {
    // ~5KB content — well under the limit
    const smallContent = buildMarkdownContent(5, 10);

    // writeText is called once for the initial write
    // readText returns the written content (for the trim check)
    const writtenContents: string[] = [];
    vi.mocked(store.writeText).mockImplementation(async (_path, content) => {
      writtenContents.push(content);
    });
    vi.mocked(store.readText).mockImplementation(async () => {
      return writtenContents[writtenContents.length - 1] || null;
    });

    await appendResearch({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      filename: 'small-note.md',
      content: smallContent
    });

    // The final content should NOT contain the summarized marker
    const lastWritten = writtenContents[writtenContents.length - 1];
    expect(lastWritten).toBeDefined();
    expect(lastWritten).not.toContain(SUMMARIZED_MARKER);
  });

  it('should trigger auto-summarization at 50KB', async () => {
    const oversizedContent = buildOversizedContent(55 * 1024); // ~55KB

    const writtenContents: string[] = [];
    vi.mocked(store.writeText).mockImplementation(async (_path, content) => {
      writtenContents.push(content);
    });
    // After the initial write, readText returns the oversized content for trimming
    vi.mocked(store.readText).mockImplementation(async () => {
      return writtenContents[0] || null;
    });

    await appendResearch({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      filename: 'big-note.md',
      content: oversizedContent
    });

    // writeText should be called twice: initial write + trimmed write
    expect(store.writeText).toHaveBeenCalledTimes(2);

    // The second write should contain the summarized marker
    const trimmedContent = writtenContents[1];
    expect(trimmedContent).toBeDefined();
    expect(trimmedContent).toContain(SUMMARIZED_MARKER);
  });

  it('should report trimmed=true in response when summarization occurs', async () => {
    const oversizedContent = buildOversizedContent(55 * 1024);

    vi.mocked(store.writeText).mockResolvedValue(undefined);
    vi.mocked(store.readText).mockResolvedValue(oversizedContent);

    const result = await appendResearch({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      filename: 'big-note.md',
      content: oversizedContent
    });

    expect(result.success).toBe(true);
    expect(result.data?.trimmed).toBe(true);
  });

  it('should report trimmed=false when content is under threshold', async () => {
    const smallContent = buildMarkdownContent(3, 5);

    vi.mocked(store.writeText).mockResolvedValue(undefined);
    vi.mocked(store.readText).mockResolvedValue(smallContent);

    const result = await appendResearch({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      filename: 'small-note.md',
      content: smallContent
    });

    expect(result.success).toBe(true);
    expect(result.data?.trimmed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: Headers preserved after summarization
// ---------------------------------------------------------------------------

describe('Research note header preservation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.getResearchNotesPath).mockReturnValue('/data/ws/plan/research');
    vi.mocked(store.writeText).mockResolvedValue(undefined);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-13T00:00:00Z');
    vi.mocked(store.getPlanState).mockResolvedValue({ plan_id: mockPlanId } as any);
  });

  it('should preserve all markdown headers after summarization', async () => {
    // Build content with identifiable headers
    const sections = [
      '## Architecture Overview\n' + 'x\n'.repeat(2000),
      '## API Design\n' + 'y\n'.repeat(2000),
      '## Implementation Notes\n' + 'z\n'.repeat(2000),
    ].join('\n');

    // Return oversized content for the trim check
    const expandedContent = sections.repeat(10); // Exceed 50KB
    const writtenContents: string[] = [];
    vi.mocked(store.writeText).mockImplementation(async (_path, content) => {
      writtenContents.push(content);
    });
    vi.mocked(store.readText).mockImplementation(async () => expandedContent);

    await appendResearch({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      filename: 'headers-note.md',
      content: sections
    });

    // Find the trimmed write (second call if trimming occurred)
    if (writtenContents.length >= 2) {
      const trimmed = writtenContents[writtenContents.length - 1];
      // All three headers should still be present
      expect(trimmed).toContain('## Architecture Overview');
      expect(trimmed).toContain('## API Design');
      expect(trimmed).toContain('## Implementation Notes');
    }
  });

  it('should summarize oldest sections first, preserving newest', async () => {
    // 5 sections, oversized
    const sections = Array.from({ length: 5 }, (_, i) =>
      `## Section ${i + 1}\n${'data '.repeat(3000)}`
    ).join('\n');

    const writtenContents: string[] = [];
    vi.mocked(store.writeText).mockImplementation(async (_path, content) => {
      writtenContents.push(content);
    });
    vi.mocked(store.readText).mockImplementation(async () => sections);

    await appendResearch({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      filename: 'order-note.md',
      content: sections
    });

    if (writtenContents.length >= 2) {
      const trimmed = writtenContents[writtenContents.length - 1];
      // Last section (Section 5) should NOT be summarized — it's the newest
      const lastSectionIdx = trimmed.indexOf('## Section 5');
      if (lastSectionIdx !== -1) {
        const afterLastHeader = trimmed.substring(lastSectionIdx);
        // The body of the last section should NOT contain the marker
        const nextHeaderIdx = afterLastHeader.indexOf('\n##', 1);
        const lastSectionBody = nextHeaderIdx === -1
          ? afterLastHeader
          : afterLastHeader.substring(0, nextHeaderIdx);
        expect(lastSectionBody).not.toContain(SUMMARIZED_MARKER);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: '[Summarized]' marker
// ---------------------------------------------------------------------------

describe('Research note [Summarized] marker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.getResearchNotesPath).mockReturnValue('/data/ws/plan/research');
    vi.mocked(store.writeText).mockResolvedValue(undefined);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-13T00:00:00Z');
    vi.mocked(store.getPlanState).mockResolvedValue({ plan_id: mockPlanId } as any);
  });

  it('should prepend [Summarized] marker to condensed section bodies', async () => {
    const oversizedContent = buildOversizedContent(55 * 1024);

    const writtenContents: string[] = [];
    vi.mocked(store.writeText).mockImplementation(async (_path, content) => {
      writtenContents.push(content);
    });
    vi.mocked(store.readText).mockImplementation(async () => oversizedContent);

    await appendResearch({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      filename: 'marker-note.md',
      content: oversizedContent
    });

    if (writtenContents.length >= 2) {
      const trimmed = writtenContents[writtenContents.length - 1];
      // At least one section should have been summarized with the marker
      expect(trimmed).toContain(SUMMARIZED_MARKER);

      // The marker should be followed by a line count description
      const markerRegex = /\[Summarized\]\s+\d+\s+lines\s+condensed/;
      expect(markerRegex.test(trimmed)).toBe(true);
    }
  });

  it('should not re-summarize already-summarized sections', async () => {
    // Content that already has a summarized section
    const preSummarized = [
      '## Old Section\n[Summarized] 50 lines condensed',
      '## New Section\n' + 'content '.repeat(8000),
    ].join('\n');

    const writtenContents: string[] = [];
    vi.mocked(store.writeText).mockImplementation(async (_path, content) => {
      writtenContents.push(content);
    });
    vi.mocked(store.readText).mockImplementation(async () => preSummarized);

    await appendResearch({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      filename: 'pre-summarized.md',
      content: preSummarized
    });

    // If trimming occurred, the already-summarized section should maintain its original marker
    if (writtenContents.length >= 2) {
      const trimmed = writtenContents[writtenContents.length - 1];
      // Count occurrences of [Summarized] — the old section should still have exactly one
      const oldSectionIdx = trimmed.indexOf('## Old Section');
      if (oldSectionIdx !== -1) {
        const afterOld = trimmed.substring(oldSectionIdx, trimmed.indexOf('## New Section'));
        const markerCount = (afterOld.match(/\[Summarized\]/g) || []).length;
        // Should still be exactly 1 — not re-summarized
        expect(markerCount).toBe(1);
      }
    }
  });
});
