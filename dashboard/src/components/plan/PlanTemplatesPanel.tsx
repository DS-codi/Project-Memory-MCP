import { useQuery } from '@tanstack/react-query';
import { FileText, Layers, Sparkles } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { PlanTemplate } from '@/types';

interface PlanTemplatesPanelProps {
  onSelectTemplate: (templateId: string) => void;
}

async function fetchPlanTemplates(): Promise<PlanTemplate[]> {
  const res = await fetch('/api/plans/templates');
  if (!res.ok) {
    throw new Error('Failed to fetch plan templates');
  }
  const data = await res.json();
  return data.templates || [];
}

export function PlanTemplatesPanel({ onSelectTemplate }: PlanTemplatesPanelProps) {
  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: ['plan-templates'],
    queryFn: fetchPlanTemplates,
  });

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-200">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-lg font-semibold">Plan Templates</h3>
          </div>
          <p className="text-sm text-slate-400">Start with a proven workflow when spinning up a new plan.</p>
        </div>
      </div>

      {isLoading && (
        <div className="mt-4 text-sm text-slate-400">Loading templates...</div>
      )}

      {error && (
        <div className="mt-4 text-sm text-red-400">Failed to load templates.</div>
      )}

      {!isLoading && templates.length === 0 && !error && (
        <div className="mt-4 text-sm text-slate-500">No templates available.</div>
      )}

      {templates.length > 0 && (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((template) => (
            <div
              key={template.template}
              className="border border-slate-700 rounded-lg p-4 bg-slate-900/60"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-violet-500/10 text-violet-300">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">{template.label}</h4>
                    <p className="text-xs text-slate-400 capitalize">{template.category}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500">{template.steps?.length ?? 0} steps</span>
              </div>

              <div className="mt-3 text-xs text-slate-400 line-clamp-3">
                {template.goals?.[0] || 'Template includes predefined goals and steps.'}
              </div>

              <button
                onClick={() => onSelectTemplate(template.template)}
                className={cn(
                  'mt-4 inline-flex items-center gap-2 text-xs font-medium',
                  'text-violet-300 hover:text-violet-200'
                )}
              >
                <FileText className="w-3.5 h-3.5" />
                Use Template
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PlanTemplatesPanel;
