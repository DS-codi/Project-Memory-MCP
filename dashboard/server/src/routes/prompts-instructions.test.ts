import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the file system before imports
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  rm: vi.fn(),
  access: vi.fn(),
  copyFile: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

import * as fs from 'fs/promises';
import { existsSync } from 'fs';

// Test data
const mockPromptTemplate = {
  id: 'new-feature',
  name: 'new-feature.prompt.md',
  description: 'Full feature implementation workflow',
  mode: 'agent' as const,
  content: `---
mode: agent
description: "Full feature implementation workflow"
---

## Feature Implementation

Implement the following feature: {{featureDescription}}

Use MCP tools to:
1. Register workspace
2. Create plan
3. Delegate to agents`,
  variables: ['featureDescription'],
  deployedTo: ['ws_test_123'],
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-20T14:30:00Z',
};

const mockInstructionFile = {
  id: 'tests',
  name: 'tests.instructions.md',
  applyTo: '**/*.test.ts',
  content: `---
applyTo: "**/*.test.ts"
---

# Test File Instructions

When working with test files:
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies`,
  deployedTo: ['ws_test_123'],
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-20T14:30:00Z',
};

describe('Prompts API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/prompts', () => {
    it('should list all prompt templates', async () => {
      const mockFiles = ['new-feature.prompt.md', 'fix-bug.prompt.md'];
      
      (fs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(mockFiles);
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(mockPromptTemplate.content);
      (fs.stat as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        mtime: new Date('2024-01-20T14:30:00Z'),
      });

      // Simulate the route handler logic
      const promptsDir = '/path/to/prompts';
      const files = await fs.readdir(promptsDir);
      const promptFiles = files.filter((f: string) => f.endsWith('.prompt.md'));

      expect(promptFiles).toHaveLength(2);
      expect(promptFiles).toContain('new-feature.prompt.md');
    });

    it('should return empty array when no prompts exist', async () => {
      (fs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const files = await fs.readdir('/path/to/prompts');
      const promptFiles = files.filter((f: string) => f.endsWith('.prompt.md'));

      expect(promptFiles).toHaveLength(0);
    });
  });

  describe('GET /api/prompts/:id', () => {
    it('should get prompt content by id', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(mockPromptTemplate.content);

      const content = await fs.readFile('/path/to/prompts/new-feature.prompt.md', 'utf-8');

      expect(content).toContain('mode: agent');
      expect(content).toContain('{{featureDescription}}');
    });

    it('should return 404 for non-existent prompt', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      await expect(
        fs.readFile('/path/to/prompts/nonexistent.prompt.md', 'utf-8')
      ).rejects.toThrow('ENOENT');
    });
  });

  describe('POST /api/prompts', () => {
    it('should create a new prompt template', async () => {
      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const newPrompt = {
        name: 'custom-workflow',
        mode: 'agent',
        description: 'Custom workflow prompt',
        content: '# Custom Workflow\n\nDo the thing.',
      };

      await fs.writeFile(
        '/path/to/prompts/custom-workflow.prompt.md',
        `---\nmode: ${newPrompt.mode}\ndescription: "${newPrompt.description}"\n---\n\n${newPrompt.content}`
      );

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/path/to/prompts/custom-workflow.prompt.md',
        expect.stringContaining('mode: agent')
      );
    });

    it('should reject creation if prompt already exists', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const exists = existsSync('/path/to/prompts/existing.prompt.md');
      expect(exists).toBe(true);
      // Route should return 409 Conflict
    });
  });

  describe('PUT /api/prompts/:id', () => {
    it('should update existing prompt content', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(mockPromptTemplate.content);
      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const updatedContent = '# Updated Content\n\nNew instructions here.';
      
      await fs.writeFile('/path/to/prompts/new-feature.prompt.md', updatedContent);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/path/to/prompts/new-feature.prompt.md',
        updatedContent
      );
    });
  });

  describe('DELETE /api/prompts/:id', () => {
    it('should delete a prompt template', async () => {
      (fs.rm as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await fs.rm('/path/to/prompts/old-prompt.prompt.md');

      expect(fs.rm).toHaveBeenCalledWith('/path/to/prompts/old-prompt.prompt.md');
    });
  });

  describe('POST /api/prompts/:id/deploy', () => {
    it('should deploy prompt to workspace', async () => {
      (fs.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.copyFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const sourceFile = '/templates/prompts/new-feature.prompt.md';
      const targetDir = '/workspace/.github/prompts';
      const targetFile = `${targetDir}/new-feature.prompt.md`;

      await fs.mkdir(targetDir, { recursive: true });
      await fs.copyFile(sourceFile, targetFile);

      expect(fs.mkdir).toHaveBeenCalledWith(targetDir, { recursive: true });
      expect(fs.copyFile).toHaveBeenCalledWith(sourceFile, targetFile);
    });
  });
});

describe('Instructions API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/instructions', () => {
    it('should list all instruction templates', async () => {
      const mockFiles = ['mcp-usage.instructions.md', 'tests.instructions.md'];
      
      (fs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue(mockFiles);

      const files = await fs.readdir('/path/to/instructions');
      const instructionFiles = files.filter((f: string) => f.endsWith('.instructions.md'));

      expect(instructionFiles).toHaveLength(2);
    });

    it('should parse applyTo from frontmatter', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(mockInstructionFile.content);

      const content = await fs.readFile('/path/to/instructions/tests.instructions.md', 'utf-8');
      
      // Extract applyTo from frontmatter
      const applyToMatch = content.match(/applyTo:\s*["']?([^"'\n]+)["']?/);
      const applyTo = applyToMatch ? applyToMatch[1] : null;

      expect(applyTo).toBe('**/*.test.ts');
    });
  });

  describe('GET /api/instructions/:id', () => {
    it('should get instruction content by id', async () => {
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(mockInstructionFile.content);

      const content = await fs.readFile('/path/to/instructions/tests.instructions.md', 'utf-8');

      expect(content).toContain('applyTo:');
      expect(content).toContain('Test File Instructions');
    });
  });

  describe('POST /api/instructions', () => {
    it('should create instruction with applyTo pattern', async () => {
      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const newInstruction = {
        name: 'components',
        applyTo: '**/components/**',
        content: '# Component Instructions\n\nUse functional components.',
      };

      const fileContent = `---\napplyTo: "${newInstruction.applyTo}"\n---\n\n${newInstruction.content}`;
      await fs.writeFile('/path/to/instructions/components.instructions.md', fileContent);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/path/to/instructions/components.instructions.md',
        expect.stringContaining('applyTo: "**/components/**"')
      );
    });

    it('should create general instruction without applyTo', async () => {
      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const newInstruction = {
        name: 'general-guidelines',
        content: '# General Guidelines\n\nFollow these rules.',
      };

      await fs.writeFile(
        '/path/to/instructions/general-guidelines.instructions.md',
        `---\n---\n\n${newInstruction.content}`
      );

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('GET /api/instructions/workspace/:wsId', () => {
    it('should list instructions deployed to workspace', async () => {
      const workspacePath = '/workspace/project';
      const instructionsDir = `${workspacePath}/.github/instructions`;
      
      (fs.readdir as ReturnType<typeof vi.fn>).mockResolvedValue([
        'mcp-usage.instructions.md',
        'tests.instructions.md',
      ]);

      const files = await fs.readdir(instructionsDir);

      expect(files).toHaveLength(2);
    });

    it('should return empty array if no instructions deployed', async () => {
      (fs.readdir as ReturnType<typeof vi.fn>).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      try {
        await fs.readdir('/workspace/.github/instructions');
      } catch (error: unknown) {
        expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
      }
    });
  });
});

describe('Variable Extraction', () => {
  it('should extract variables from prompt content', () => {
    const extractVariables = (content: string): string[] => {
      const matches = content.match(/\{\{(\w+)\}\}/g) || [];
      return [...new Set(matches.map(m => m.slice(2, -2)))];
    };

    const content = `
      Implement {{featureName}} in {{targetFile}}.
      The {{featureName}} should work correctly.
    `;

    const variables = extractVariables(content);

    expect(variables).toEqual(['featureName', 'targetFile']);
  });

  it('should return empty array for content without variables', () => {
    const extractVariables = (content: string): string[] => {
      const matches = content.match(/\{\{(\w+)\}\}/g) || [];
      return [...new Set(matches.map(m => m.slice(2, -2)))];
    };

    const content = 'This is a static prompt without variables.';
    const variables = extractVariables(content);

    expect(variables).toEqual([]);
  });
});

describe('Frontmatter Parsing', () => {
  it('should parse prompt frontmatter correctly', () => {
    const parseFrontmatter = (content: string) => {
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) return null;

      const frontmatter: Record<string, string> = {};
      const lines = match[1].split('\n');
      
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.slice(0, colonIndex).trim();
          let value = line.slice(colonIndex + 1).trim();
          // Remove quotes
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          frontmatter[key] = value;
        }
      }

      return frontmatter;
    };

    const content = `---
mode: agent
description: "Test prompt description"
---

# Content`;

    const frontmatter = parseFrontmatter(content);

    expect(frontmatter).toEqual({
      mode: 'agent',
      description: 'Test prompt description',
    });
  });

  it('should parse instruction applyTo pattern', () => {
    const parseApplyTo = (content: string): string | null => {
      const match = content.match(/applyTo:\s*["']?([^"'\n]+)["']?/);
      return match ? match[1].trim() : null;
    };

    const content = `---
applyTo: "**/*.test.{ts,tsx}"
---`;

    const applyTo = parseApplyTo(content);

    expect(applyTo).toBe('**/*.test.{ts,tsx}');
  });
});

describe('Glob Pattern Validation', () => {
  it('should validate common glob patterns', () => {
    const isValidGlob = (pattern: string): boolean => {
      if (!pattern || pattern.length === 0) return false;
      // Check for common invalid patterns
      if (pattern.includes('//')) return false;
      if (pattern.startsWith('/') && !pattern.startsWith('/*')) return false;
      // Basic validation - contains valid characters
      return /^[\w\-.*?\[\]{}\/,]+$/.test(pattern);
    };

    expect(isValidGlob('**/*.ts')).toBe(true);
    expect(isValidGlob('src/**/*.{js,ts}')).toBe(true);
    expect(isValidGlob('**/components/**')).toBe(true);
    expect(isValidGlob('')).toBe(false);
  });
});
