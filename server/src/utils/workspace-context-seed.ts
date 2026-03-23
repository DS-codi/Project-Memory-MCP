import type { WorkspaceContextSection, WorkspaceProfile } from '../types/index.js';

export const CANONICAL_WORKSPACE_SECTION_KEYS = [
  'project_details',
  'purpose',
  'dependencies',
  'modules',
  'test_confirmations',
  'dev_patterns',
  'resources'
] as const;

interface WorkspaceContextSeedOptions {
  workspaceName?: string;
  workspacePath?: string;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function joinNonEmpty(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(' ');
}

function summarizeConventions(profile: WorkspaceProfile): string[] {
  const conventions: string[] = [];

  if (profile.conventions.indentation) {
    const indentDetail = profile.conventions.indent_size
      ? `${profile.conventions.indentation} (${profile.conventions.indent_size})`
      : profile.conventions.indentation;
    conventions.push(`Indentation: ${indentDetail}`);
  }

  if (profile.conventions.quote_style) {
    conventions.push(`Quotes: ${profile.conventions.quote_style}`);
  }

  if (typeof profile.conventions.semicolons === 'boolean') {
    conventions.push(`Semicolons: ${profile.conventions.semicolons ? 'required' : 'omitted'}`);
  }

  if (profile.conventions.trailing_commas !== undefined) {
    conventions.push(`Trailing commas: ${profile.conventions.trailing_commas ? 'enabled' : 'disabled'}`);
  }

  if (profile.conventions.line_endings) {
    conventions.push(`Line endings: ${profile.conventions.line_endings.toUpperCase()}`);
  }

  if (profile.conventions.max_line_length) {
    conventions.push(`Max line length: ${profile.conventions.max_line_length}`);
  }

  return conventions;
}

export function buildWorkspaceContextSectionsFromProfile(
  profile: WorkspaceProfile,
  options: WorkspaceContextSeedOptions = {}
): Record<string, WorkspaceContextSection> {
  const langNames = profile.languages.map(language => language.name);
  const stackParts = [...langNames, ...profile.frameworks].filter(Boolean);
  const projectSummary = stackParts.length > 0
    ? `Detected stack: ${stackParts.join(', ')}.`
    : 'Codebase indexed but no specific stack detected.';

  const projectItems = profile.languages.map(language => ({
    title: language.name,
    description: `${language.percentage}% of codebase (${language.file_count} files)`
  }));

  if (profile.build_system) {
    projectItems.push({
      title: `Build: ${profile.build_system.type}`,
      description: profile.build_system.config_file
    });
  }

  if (profile.test_framework) {
    projectItems.push({
      title: `Tests: ${profile.test_framework.name}`,
      description: profile.test_framework.config_file ?? 'auto-detected'
    });
  }

  if (profile.package_manager) {
    projectItems.push({
      title: `Package Manager: ${profile.package_manager}`,
      description: ''
    });
  }

  const dependencyItems = profile.frameworks.map(framework => ({
    title: framework,
    description: 'Detected framework/library'
  }));

  if (profile.package_manager) {
    dependencyItems.push({
      title: profile.package_manager,
      description: 'Detected package manager'
    });
  }

  if (profile.build_system) {
    dependencyItems.push({
      title: profile.build_system.type,
      description: `Build system via ${profile.build_system.config_file}`
    });
  }

  if (profile.test_framework) {
    dependencyItems.push({
      title: profile.test_framework.name,
      description: profile.test_framework.config_file ?? 'Detected test framework'
    });
  }

  const purposeSummary = joinNonEmpty([
    options.workspaceName ? `${options.workspaceName} is the active workspace.` : undefined,
    stackParts.length > 0 ? `Primary implementation stack: ${stackParts.join(', ')}.` : 'Implementation stack has not been inferred yet.',
    `Indexed footprint: ${pluralize(profile.total_files, 'file')} and ${pluralize(profile.total_lines, 'line')}.`
  ]);

  const purposeItems = [
    {
      title: 'Workspace scope',
      description: `Indexed repository with ${pluralize(profile.languages.length, 'language')} and ${pluralize(profile.frameworks.length, 'framework')}.`
    },
    ...(options.workspacePath ? [{
      title: 'Workspace root',
      description: options.workspacePath
    }] : [])
  ];

  const moduleItems = profile.key_directories.map(directory => ({
    title: directory.path,
    description: `${directory.purpose} (${pluralize(directory.file_count, 'file')})`
  }));

  const moduleSummary = moduleItems.length > 0
    ? `Key directories detected: ${moduleItems.slice(0, 4).map(directory => directory.title).join(', ')}${moduleItems.length > 4 ? ', ...' : ''}.`
    : 'No key directories were detected during indexing.';

  const testItems = [] as Array<{ title: string; description: string }>;
  if (profile.test_framework) {
    testItems.push({
      title: `Test framework: ${profile.test_framework.name}`,
      description: profile.test_framework.config_file ?? 'Configuration file not detected'
    });

    if (profile.test_framework.test_command) {
      testItems.push({
        title: 'Primary test command',
        description: profile.test_framework.test_command
      });
    }

    if (profile.test_framework.test_directory) {
      testItems.push({
        title: 'Test directory',
        description: profile.test_framework.test_directory
      });
    }
  }

  if (profile.build_system?.build_command) {
    testItems.push({
      title: 'Build verification',
      description: profile.build_system.build_command
    });
  }

  const testSummary = profile.test_framework
    ? `Use ${profile.test_framework.name} for validation${profile.test_framework.test_command ? ` via ${profile.test_framework.test_command}` : ''}.`
    : 'No dedicated test framework was detected; validate changes with the available build or runtime checks.';

  const conventionSummaries = summarizeConventions(profile);
  const devPatternItems = [
    ...conventionSummaries.map(summary => ({ title: summary, description: '' })),
    ...(profile.build_system?.dev_command ? [{
      title: 'Primary dev command',
      description: profile.build_system.dev_command
    }] : []),
    ...(profile.package_manager ? [{
      title: 'Package manager workflow',
      description: `Prefer ${profile.package_manager} commands for dependency and script operations.`
    }] : [])
  ];

  const devPatternSummary = conventionSummaries.length > 0
    ? `Detected development conventions: ${conventionSummaries.join('; ')}.`
    : 'No explicit coding conventions were inferred from indexing data.';

  const resourceItems = [
    ...(options.workspacePath ? [{
      title: 'Workspace root',
      description: options.workspacePath
    }] : []),
    ...(profile.build_system ? [{
      title: 'Build configuration',
      description: profile.build_system.config_file
    }] : []),
    ...(profile.test_framework?.config_file ? [{
      title: 'Test configuration',
      description: profile.test_framework.config_file
    }] : []),
    ...profile.key_directories
      .filter(directory => ['docs', 'config', 'assets', 'scripts'].includes(directory.purpose))
      .slice(0, 6)
      .map(directory => ({
        title: directory.path,
        description: `${directory.purpose} directory`
      }))
  ];

  const resourceSummary = resourceItems.length > 0
    ? 'Reference resources include the workspace root, detected config files, and key support directories.'
    : 'No dedicated resource directories or config files were detected during indexing.';

  return {
    project_details: {
      summary: projectSummary,
      items: projectItems
    },
    purpose: {
      summary: purposeSummary,
      items: purposeItems
    },
    dependencies: {
      summary: dependencyItems.length > 0
        ? `${dependencyItems.length} dependency or tool signal(s) detected.`
        : 'No frameworks, package manager, or test/build dependencies were detected during indexing.',
      items: dependencyItems
    },
    modules: {
      summary: moduleSummary,
      items: moduleItems
    },
    test_confirmations: {
      summary: testSummary,
      items: testItems
    },
    dev_patterns: {
      summary: devPatternSummary,
      items: devPatternItems
    },
    resources: {
      summary: resourceSummary,
      items: resourceItems
    }
  };
}