import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { WorkspaceContext, WorkspaceContextSection } from '@/types';

interface WorkspaceContextPanelProps {
  workspaceId: string;
  workspaceName?: string;
}

interface WorkspaceContextResponse {
  exists?: boolean;
  context?: WorkspaceContext;
  path?: string;
}

interface WorkspaceContextSaveResponse {
  success?: boolean;
  context?: WorkspaceContext;
  path?: string;
}

interface SectionDefinition {
  key: string;
  label: string;
  description: string;
}

interface SectionItemState {
  title: string;
  description: string;
  links: string;
}

interface SectionState {
  summary: string;
  items: SectionItemState[];
}

type SectionStateMap = Record<string, SectionState>;

const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    key: 'project_details',
    label: 'Project Details',
    description: 'High-level details such as stack, ownership, and scope.',
  },
  {
    key: 'purpose',
    label: 'Purpose',
    description: 'What this workspace exists to deliver.',
  },
  {
    key: 'dependencies',
    label: 'Dependencies',
    description: 'Key services, packages, or systems this project relies on.',
  },
  {
    key: 'modules',
    label: 'Modules',
    description: 'Core modules and how responsibilities are divided.',
  },
  {
    key: 'test_confirmations',
    label: 'Test Confirmations',
    description: 'Required test suites, validations, and completion checks.',
  },
  {
    key: 'dev_patterns',
    label: 'Dev Patterns',
    description: 'Preferred development patterns, conventions, and workflows.',
  },
  {
    key: 'resources',
    label: 'Resources',
    description: 'Docs, dashboards, and reference material for the team.',
  },
];

const createEmptySections = (): SectionStateMap => {
  return SECTION_DEFINITIONS.reduce<SectionStateMap>((acc, section) => {
    acc[section.key] = { summary: '', items: [] };
    return acc;
  }, {});
};

const mapContextToState = (context?: WorkspaceContext): SectionStateMap => {
  const base = createEmptySections();
  if (!context?.sections) {
    return base;
  }

  for (const [key, value] of Object.entries(context.sections)) {
    base[key] = {
      summary: value.summary || '',
      items: (value.items || []).map((item) => ({
        title: item.title,
        description: item.description || '',
        links: (item.links || []).join('\n'),
      })),
    };
  }

  return base;
};

const mapStateToSections = (state: SectionStateMap): Record<string, WorkspaceContextSection> => {
  const mapped: Record<string, WorkspaceContextSection> = {};

  for (const [key, value] of Object.entries(state)) {
    const items = value.items
      .map((item) => ({
        title: item.title.trim(),
        description: item.description.trim() || undefined,
        links: item.links
          .split('\n')
          .map((link) => link.trim())
          .filter(Boolean),
      }))
      .filter((item) => item.title.length > 0);

    mapped[key] = {
      summary: value.summary.trim() || undefined,
      items: items.length > 0 ? items : undefined,
    };
  }

  return mapped;
};

async function fetchWorkspaceContext(workspaceId: string): Promise<WorkspaceContextResponse> {
  const res = await fetch(`/api/workspaces/${workspaceId}/context`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to fetch workspace context');
  }
  return res.json();
}

export function WorkspaceContextPanel({ workspaceId, workspaceName }: WorkspaceContextPanelProps) {
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<SectionStateMap>(() => createEmptySections());
  const [initialized, setInitialized] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['workspace-context', workspaceId],
    queryFn: () => fetchWorkspaceContext(workspaceId),
    enabled: Boolean(workspaceId),
  });

  useEffect(() => {
    if (data && !initialized) {
      setSections(mapContextToState(data.context));
      setInitialized(true);
      setHasChanges(false);
    }
  }, [data, initialized]);

  useEffect(() => {
    setSections(createEmptySections());
    setInitialized(false);
    setHasChanges(false);
  }, [workspaceId]);

  const saveMutation = useMutation({
    mutationFn: async (): Promise<WorkspaceContextSaveResponse> => {
      const payload = {
        name: workspaceName,
        sections: mapStateToSections(sections),
      };

      const res = await fetch(`/api/workspaces/${workspaceId}/context`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save workspace context');
      }

      return res.json();
    },
    onSuccess: (response) => {
      if (response?.context) {
        setSections(mapContextToState(response.context));
      }
      setInitialized(true);
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['workspace-context', workspaceId] });
    },
  });

  const handleSummaryChange = (key: string, value: string) => {
    setSections((current) => ({
      ...current,
      [key]: {
        ...current[key],
        summary: value,
      },
    }));
    setHasChanges(true);
  };

  const handleItemChange = (key: string, index: number, field: keyof SectionItemState, value: string) => {
    setSections((current) => {
      const items = [...current[key].items];
      items[index] = { ...items[index], [field]: value };
      return {
        ...current,
        [key]: {
          ...current[key],
          items,
        },
      };
    });
    setHasChanges(true);
  };

  const handleAddItem = (key: string) => {
    setSections((current) => ({
      ...current,
      [key]: {
        ...current[key],
        items: [...current[key].items, { title: '', description: '', links: '' }],
      },
    }));
    setHasChanges(true);
  };

  const handleRemoveItem = (key: string, index: number) => {
    setSections((current) => ({
      ...current,
      [key]: {
        ...current[key],
        items: current[key].items.filter((_, itemIndex) => itemIndex !== index),
      },
    }));
    setHasChanges(true);
  };

  const headerMeta = useMemo(() => {
    if (!data?.context?.updated_at) {
      return 'No saved context yet.';
    }
    return `Last updated ${new Date(data.context.updated_at).toLocaleString()}`;
  }, [data?.context?.updated_at]);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Workspace Context</h3>
          <p className="text-sm text-slate-400">Maintain shared context for the workspace across agents.</p>
          <p className="text-xs text-slate-500 mt-2">{headerMeta}</p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={!hasChanges || saveMutation.isPending}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            hasChanges
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          )}
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saveMutation.isPending ? 'Saving...' : 'Save Context'}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-400 mt-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading workspace context...
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" />
          {(error as Error).message}
        </div>
      )}

      {!isLoading && (
        <div className="mt-6 space-y-6">
          {SECTION_DEFINITIONS.map((section) => {
            const current = sections[section.key];
            return (
              <div key={section.key} className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-semibold text-white">{section.label}</h4>
                    <p className="text-xs text-slate-500">{section.description}</p>
                  </div>
                  <button
                    onClick={() => handleAddItem(section.key)}
                    className="inline-flex items-center gap-1 text-xs text-emerald-300 hover:text-emerald-200"
                  >
                    <Plus className="w-3 h-3" />
                    Add Item
                  </button>
                </div>

                <div className="mt-4">
                  <label className="block text-xs text-slate-400 mb-2">Summary</label>
                  <textarea
                    value={current.summary}
                    onChange={(e) => handleSummaryChange(section.key, e.target.value)}
                    rows={2}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                    placeholder={`Add a short summary for ${section.label.toLowerCase()}...`}
                  />
                </div>

                {current.items.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {current.items.map((item, index) => (
                      <div key={`${section.key}-item-${index}`} className="border border-slate-700/60 rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-2">
                            <input
                              type="text"
                              value={item.title}
                              onChange={(e) => handleItemChange(section.key, index, 'title', e.target.value)}
                              placeholder="Title"
                              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                            />
                            <textarea
                              value={item.description}
                              onChange={(e) => handleItemChange(section.key, index, 'description', e.target.value)}
                              placeholder="Description"
                              rows={2}
                              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                            />
                            <textarea
                              value={item.links}
                              onChange={(e) => handleItemChange(section.key, index, 'links', e.target.value)}
                              placeholder="Links (one per line)"
                              rows={2}
                              className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <button
                            onClick={() => handleRemoveItem(section.key, index)}
                            className="p-2 text-slate-500 hover:text-red-400"
                            title="Remove item"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WorkspaceContextPanel;
