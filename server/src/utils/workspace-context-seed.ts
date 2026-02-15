import type { WorkspaceContextSection, WorkspaceProfile } from '../types/index.js';

export function buildWorkspaceContextSectionsFromProfile(
  profile: WorkspaceProfile
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

  return {
    project_details: {
      summary: projectSummary,
      items: projectItems
    },
    ...(dependencyItems.length > 0 ? {
      dependencies: {
        summary: `${dependencyItems.length} framework(s)/library(s) detected.`,
        items: dependencyItems
      }
    } : {})
  };
}