/**
 * Workspace Indexer - Analyzes and indexes a codebase on first registration
 * 
 * Creates a workspace profile with:
 * - Language detection
 * - Framework identification
 * - Build system detection
 * - Test framework detection
 * - Directory structure analysis
 * - Coding conventions detection
 */

import { readdir, stat, readFile } from 'fs/promises';
import { join, extname, basename } from 'path';
import type { 
  WorkspaceProfile, 
  LanguageInfo, 
  BuildSystemInfo, 
  TestFrameworkInfo,
  DirectoryInfo,
  CodingConventions 
} from '../types/index.js';

// =============================================================================
// Language Detection
// =============================================================================

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.cs': 'C#',
  '.cpp': 'C++',
  '.c': 'C',
  '.h': 'C/C++ Header',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.scala': 'Scala',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.dart': 'Dart',
  '.lua': 'Lua',
  '.r': 'R',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.ps1': 'PowerShell',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.json': 'JSON',
  '.xml': 'XML',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.less': 'Less',
  '.md': 'Markdown',
};

// Directories to skip during indexing
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  'target',
  '__pycache__',
  '.pytest_cache',
  '.next',
  '.nuxt',
  'coverage',
  '.idea',
  '.vscode',
  'vendor',
  'packages',  // monorepo packages (index separately if needed)
]);

// =============================================================================
// Build System Detection
// =============================================================================

const BUILD_SYSTEM_FILES: Record<string, BuildSystemInfo> = {
  'package.json': { type: 'npm', config_file: 'package.json' },
  'yarn.lock': { type: 'yarn', config_file: 'package.json' },
  'pnpm-lock.yaml': { type: 'pnpm', config_file: 'package.json' },
  'Cargo.toml': { type: 'cargo', config_file: 'Cargo.toml', build_command: 'cargo build' },
  'go.mod': { type: 'go', config_file: 'go.mod', build_command: 'go build' },
  'build.gradle': { type: 'gradle', config_file: 'build.gradle', build_command: 'gradle build' },
  'build.gradle.kts': { type: 'gradle', config_file: 'build.gradle.kts', build_command: 'gradle build' },
  'pom.xml': { type: 'maven', config_file: 'pom.xml', build_command: 'mvn package' },
  'Makefile': { type: 'make', config_file: 'Makefile', build_command: 'make' },
  'CMakeLists.txt': { type: 'cmake', config_file: 'CMakeLists.txt', build_command: 'cmake --build .' },
  'pyproject.toml': { type: 'python', config_file: 'pyproject.toml' },
  'setup.py': { type: 'python', config_file: 'setup.py', build_command: 'python setup.py build' },
  'requirements.txt': { type: 'pip', config_file: 'requirements.txt' },
  'Gemfile': { type: 'bundler', config_file: 'Gemfile', build_command: 'bundle install' },
  'composer.json': { type: 'composer', config_file: 'composer.json', build_command: 'composer install' },
};

// =============================================================================
// Test Framework Detection
// =============================================================================

const TEST_FRAMEWORK_PATTERNS: Array<{
  pattern: RegExp;
  name: string;
  config_files?: string[];
}> = [
  { pattern: /jest/i, name: 'Jest', config_files: ['jest.config.js', 'jest.config.ts'] },
  { pattern: /vitest/i, name: 'Vitest', config_files: ['vitest.config.ts', 'vitest.config.js'] },
  { pattern: /mocha/i, name: 'Mocha', config_files: ['.mocharc.json', '.mocharc.js'] },
  { pattern: /pytest/i, name: 'pytest', config_files: ['pytest.ini', 'pyproject.toml'] },
  { pattern: /unittest/i, name: 'unittest' },
  { pattern: /junit/i, name: 'JUnit' },
  { pattern: /rspec/i, name: 'RSpec', config_files: ['.rspec'] },
  { pattern: /cypress/i, name: 'Cypress', config_files: ['cypress.config.js', 'cypress.config.ts'] },
  { pattern: /playwright/i, name: 'Playwright', config_files: ['playwright.config.ts'] },
];

// =============================================================================
// Framework Detection
// =============================================================================

const FRAMEWORK_PATTERNS: Array<{
  pattern: RegExp;
  name: string;
  files?: string[];
}> = [
  { pattern: /react/i, name: 'React' },
  { pattern: /next/i, name: 'Next.js', files: ['next.config.js', 'next.config.ts'] },
  { pattern: /vue/i, name: 'Vue.js' },
  { pattern: /nuxt/i, name: 'Nuxt', files: ['nuxt.config.js', 'nuxt.config.ts'] },
  { pattern: /angular/i, name: 'Angular', files: ['angular.json'] },
  { pattern: /svelte/i, name: 'Svelte' },
  { pattern: /express/i, name: 'Express' },
  { pattern: /fastify/i, name: 'Fastify' },
  { pattern: /nestjs|@nestjs/i, name: 'NestJS' },
  { pattern: /django/i, name: 'Django' },
  { pattern: /flask/i, name: 'Flask' },
  { pattern: /fastapi/i, name: 'FastAPI' },
  { pattern: /rails/i, name: 'Ruby on Rails' },
  { pattern: /spring/i, name: 'Spring' },
  { pattern: /laravel/i, name: 'Laravel' },
  { pattern: /electron/i, name: 'Electron' },
  { pattern: /tauri/i, name: 'Tauri' },
];

// =============================================================================
// Main Indexer
// =============================================================================

interface FileStats {
  extension: string;
  lines: number;
}

export async function indexWorkspace(workspacePath: string): Promise<WorkspaceProfile> {
  const languageStats: Map<string, { files: number; lines: number; extensions: Set<string> }> = new Map();
  const directories: DirectoryInfo[] = [];
  let totalFiles = 0;
  let totalLines = 0;
  let buildSystem: BuildSystemInfo | undefined;
  let testFramework: TestFrameworkInfo | undefined;
  const detectedFrameworks: Set<string> = new Set();
  let packageJsonContent: string | null = null;

  // Recursive directory walker
  async function walkDirectory(dirPath: string, depth: number = 0): Promise<void> {
    if (depth > 10) return; // Prevent too deep recursion

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      let dirFileCount = 0;

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) {
            await walkDirectory(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          dirFileCount++;
          totalFiles++;
          
          const ext = extname(entry.name).toLowerCase();
          const fileName = entry.name;

          // Check for build system
          if (BUILD_SYSTEM_FILES[fileName] && !buildSystem) {
            buildSystem = { ...BUILD_SYSTEM_FILES[fileName] };
          }

          // Read package.json for framework/test detection
          if (fileName === 'package.json' && depth === 0) {
            try {
              packageJsonContent = await readFile(fullPath, 'utf-8');
            } catch { /* ignore */ }
          }

          // Track language stats
          const language = EXTENSION_TO_LANGUAGE[ext];
          if (language) {
            const stats = languageStats.get(language) || { files: 0, lines: 0, extensions: new Set() };
            stats.files++;
            stats.extensions.add(ext);
            
            // Count lines (sample for large files)
            try {
              const content = await readFile(fullPath, 'utf-8');
              const lines = content.split('\n').length;
              stats.lines += lines;
              totalLines += lines;

              // Detect conventions from source files
              if (['.ts', '.js', '.tsx', '.jsx'].includes(ext) && stats.files <= 5) {
                // Convention detection would go here
              }
            } catch { /* ignore unreadable files */ }
            
            languageStats.set(language, stats);
          }
        }
      }

      // Record directory info for top-level directories
      if (depth === 1 && dirFileCount > 0) {
        const dirName = basename(dirPath);
        let purpose = 'other';
        
        if (/^(src|lib|app|source)$/i.test(dirName)) purpose = 'source';
        else if (/^(test|tests|spec|specs|__tests__)$/i.test(dirName)) purpose = 'tests';
        else if (/^(config|configs|configuration)$/i.test(dirName)) purpose = 'config';
        else if (/^(docs|documentation|doc)$/i.test(dirName)) purpose = 'docs';
        else if (/^(assets|static|public|resources)$/i.test(dirName)) purpose = 'assets';
        else if (/^(scripts|bin|tools)$/i.test(dirName)) purpose = 'scripts';
        else if (/^(types|typings|@types)$/i.test(dirName)) purpose = 'types';
        
        directories.push({
          path: dirName,
          purpose,
          file_count: dirFileCount
        });
      }
    } catch (error) {
      // Skip inaccessible directories
    }
  }

  // Start indexing
  await walkDirectory(workspacePath);

  // Detect frameworks and test framework from package.json
  if (packageJsonContent) {
    try {
      const pkg = JSON.parse(packageJsonContent);
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies
      };

      // Detect frameworks
      for (const dep of Object.keys(allDeps)) {
        for (const fp of FRAMEWORK_PATTERNS) {
          if (fp.pattern.test(dep)) {
            detectedFrameworks.add(fp.name);
          }
        }
      }

      // Detect test framework
      for (const dep of Object.keys(allDeps)) {
        for (const tf of TEST_FRAMEWORK_PATTERNS) {
          if (tf.pattern.test(dep) && !testFramework) {
            testFramework = {
              name: tf.name,
              test_command: pkg.scripts?.test || 'npm test'
            };
          }
        }
      }

      // Enhance build system with scripts
      if (buildSystem && buildSystem.type === 'npm') {
        buildSystem.build_command = pkg.scripts?.build ? 'npm run build' : undefined;
        buildSystem.dev_command = pkg.scripts?.dev ? 'npm run dev' : 
                                  pkg.scripts?.start ? 'npm start' : undefined;
      }
    } catch { /* ignore parse errors */ }
  }

  // Convert language stats to array
  const languages: LanguageInfo[] = Array.from(languageStats.entries())
    .map(([name, stats]) => ({
      name,
      percentage: totalFiles > 0 ? Math.round((stats.files / totalFiles) * 100) : 0,
      file_count: stats.files,
      extensions: Array.from(stats.extensions)
    }))
    .filter(l => !['JSON', 'YAML', 'Markdown', 'XML'].includes(l.name)) // Filter out config/doc languages
    .sort((a, b) => b.file_count - a.file_count)
    .slice(0, 10); // Top 10 languages

  // Detect coding conventions (simplified - would need more analysis in practice)
  const conventions: CodingConventions = {};

  return {
    indexed_at: new Date().toISOString(),
    languages,
    frameworks: Array.from(detectedFrameworks),
    build_system: buildSystem,
    test_framework: testFramework,
    package_manager: buildSystem?.type === 'npm' || buildSystem?.type === 'yarn' || buildSystem?.type === 'pnpm' 
      ? buildSystem.type : undefined,
    key_directories: directories.sort((a, b) => b.file_count - a.file_count),
    conventions,
    total_files: totalFiles,
    total_lines: totalLines
  };
}

/**
 * Quick check if workspace needs indexing
 */
export async function needsIndexing(workspacePath: string, existingProfile?: WorkspaceProfile): Promise<boolean> {
  if (!existingProfile) return true;
  
  // Re-index if profile is older than 7 days
  const indexedAt = new Date(existingProfile.indexed_at);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  return indexedAt < weekAgo;
}
