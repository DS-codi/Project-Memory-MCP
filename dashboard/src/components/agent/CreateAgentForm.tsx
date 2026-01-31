import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Plus } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CreateAgentFormProps {
  onClose: () => void;
  onSuccess?: (agentId: string) => void;
}

interface AgentFormData {
  agent_id: string;
  content: string;
}

const AGENT_TEMPLATES = {
  blank: {
    label: 'Blank',
    content: `# {name} Agent

## Role

Describe the agent's role and responsibilities here.

## Guidelines

- Guideline 1
- Guideline 2
- Guideline 3

## Workflow

1. Step 1
2. Step 2
3. Step 3
`,
  },
  coordinator: {
    label: 'Coordinator',
    content: `# {name} Agent

## Role

You are the Coordinator agent responsible for orchestrating workflows and managing handoffs between other agents.

## Responsibilities

- Analyze incoming requests and categorize them
- Create structured plans with clear phases
- Delegate tasks to appropriate specialist agents
- Track progress and handle blockers

## Workflow

1. Receive and analyze the request
2. Create or update the plan structure
3. Identify required agents for each phase
4. Initiate handoff to the first agent
5. Monitor progress and facilitate transitions

## Handoff Protocol

When handing off to another agent:
- Provide clear context and objectives
- Include relevant file references
- Specify expected outputs
- Note any constraints or dependencies
`,
  },
  executor: {
    label: 'Executor',
    content: `# {name} Agent

## Role

You are the Executor agent responsible for implementing code changes and features.

## Responsibilities

- Implement code based on architectural plans
- Follow coding standards and best practices
- Write clean, maintainable code
- Document significant changes

## Workflow

1. Review the plan and architecture
2. Understand the scope of changes
3. Implement changes incrementally
4. Test changes locally when possible
5. Update execution log with progress
6. Handoff to Reviewer when complete

## Best Practices

- Keep commits atomic and focused
- Add comments for complex logic
- Follow existing patterns in the codebase
- Consider edge cases and error handling
`,
  },
  reviewer: {
    label: 'Reviewer',
    content: `# {name} Agent

## Role

You are the Reviewer agent responsible for code review and quality assurance.

## Responsibilities

- Review code changes for correctness
- Check adherence to coding standards
- Identify potential bugs or issues
- Suggest improvements when applicable

## Review Checklist

- [ ] Code meets acceptance criteria
- [ ] No obvious bugs or issues
- [ ] Error handling is appropriate
- [ ] Code is readable and maintainable
- [ ] Tests are adequate (if applicable)

## Workflow

1. Read the plan and understand requirements
2. Review all changed files
3. Document findings in review.json
4. Approve or request changes
5. Handoff back to Executor or forward to Tester
`,
  },
  custom: {
    label: 'Custom',
    content: '',
  },
};

async function createAgent(data: AgentFormData): Promise<{ agent: { agent_id: string } }> {
  const res = await fetch('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to create agent');
  }
  
  return res.json();
}

export function CreateAgentForm({ onClose, onSuccess }: CreateAgentFormProps) {
  const queryClient = useQueryClient();
  const [agentId, setAgentId] = useState('');
  const [template, setTemplate] = useState<keyof typeof AGENT_TEMPLATES>('blank');
  const [content, setContent] = useState('');
  const [step, setStep] = useState<'name' | 'content'>('name');
  
  const mutation = useMutation({
    mutationFn: createAgent,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      onSuccess?.(data.agent.agent_id);
      onClose();
    },
  });
  
  const handleTemplateSelect = (templateKey: keyof typeof AGENT_TEMPLATES) => {
    setTemplate(templateKey);
    if (templateKey !== 'custom') {
      const templateContent = AGENT_TEMPLATES[templateKey].content
        .replace(/{name}/g, agentId.charAt(0).toUpperCase() + agentId.slice(1));
      setContent(templateContent);
    } else {
      setContent('');
    }
  };
  
  const handleNext = () => {
    if (!agentId.trim()) return;
    
    // Auto-select and generate content from template
    const templateContent = AGENT_TEMPLATES[template].content
      .replace(/{name}/g, agentId.charAt(0).toUpperCase() + agentId.slice(1));
    setContent(templateContent);
    setStep('content');
  };
  
  const handleSubmit = () => {
    if (!agentId.trim() || !content.trim()) return;
    
    mutation.mutate({
      agent_id: agentId.toLowerCase().replace(/\s+/g, '-'),
      content,
    });
  };
  
  const isValidId = /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(agentId);
  
  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-full max-w-2xl max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Plus className="w-5 h-5 text-green-400" />
            Create New Agent
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {step === 'name' ? (
          <div className="p-6">
            {/* Agent ID Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Agent ID
              </label>
              <input
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="e.g., debugger, optimizer, documenter"
                className={cn(
                  'w-full bg-slate-900 border rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2',
                  agentId && !isValidId
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-slate-600 focus:ring-blue-500'
                )}
                autoFocus
              />
              {agentId && !isValidId && (
                <p className="mt-2 text-sm text-red-400">
                  ID must start with a letter and contain only letters, numbers, hyphens, and underscores
                </p>
              )}
              <p className="mt-2 text-sm text-slate-500">
                This will create <code className="text-blue-400">{agentId || 'name'}.agent.md</code>
              </p>
            </div>
            
            {/* Template Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Start from Template
              </label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(AGENT_TEMPLATES).map(([key, { label }]) => (
                  <button
                    key={key}
                    onClick={() => handleTemplateSelect(key as keyof typeof AGENT_TEMPLATES)}
                    className={cn(
                      'p-4 rounded-lg border text-left transition-colors',
                      template === key
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                        : 'border-slate-600 hover:border-slate-500 text-slate-300'
                    )}
                  >
                    <div className="font-medium">{label}</div>
                    <div className="text-sm text-slate-500 mt-1">
                      {key === 'blank' && 'Start with basic structure'}
                      {key === 'coordinator' && 'Orchestrate workflows'}
                      {key === 'executor' && 'Implement code changes'}
                      {key === 'reviewer' && 'Review and QA'}
                      {key === 'custom' && 'Write from scratch'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleNext}
                disabled={!agentId.trim() || !isValidId}
                className={cn(
                  'px-4 py-2 rounded-lg flex items-center gap-2',
                  agentId.trim() && isValidId
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                )}
              >
                Next
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-[60vh]">
            {/* Content Editor */}
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-slate-400">Editing:</span>{' '}
                <code className="text-blue-400">{agentId}.agent.md</code>
              </div>
              <button
                onClick={() => setStep('name')}
                className="text-sm text-slate-400 hover:text-white"
              >
                ← Back
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full h-full bg-slate-900 text-slate-100 p-4 resize-none font-mono text-sm focus:outline-none"
                spellCheck={false}
                placeholder="Write your agent instructions in Markdown..."
              />
            </div>
            
            {/* Actions */}
            <div className="p-4 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!content.trim() || mutation.isPending}
                className={cn(
                  'px-4 py-2 rounded-lg flex items-center gap-2',
                  content.trim()
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                )}
              >
                {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Agent
              </button>
            </div>
            
            {mutation.isError && (
              <div className="px-4 pb-4 text-sm text-red-400">
                Error: {(mutation.error as Error).message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CreateAgentForm;

