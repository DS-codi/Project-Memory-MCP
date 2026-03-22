import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Save, 
  Eye, 
  Edit3, 
  Loader2,
  Database,
  Check,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/utils/cn';

type EntityType = 'agent' | 'instruction' | 'skill';

interface EntityData {
  id: string;
  name: string;
  content: string;
  updated_at: string;
  metadata?: any;
}

async function fetchDbEntity(type: EntityType, id: string): Promise<EntityData> {
  const endpoint = type === 'agent' ? `/api/agents/db/${id}` : 
                   type === 'instruction' ? `/api/instructions/db/${id}` :
                   `/api/skills/db/${id}`;
  
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`Failed to fetch ${type}`);
  const data = await res.json();
  
  if (type === 'agent') return { ...data.agent, id: data.agent.name };
  if (type === 'instruction') return { ...data.instruction, id: data.instruction.filename, name: data.instruction.filename };
  if (type === 'skill') return { ...data.skill, id: data.skill.name };
  throw new Error('Unknown type');
}

async function updateDbEntity(type: EntityType, id: string, content: string): Promise<void> {
  const endpoint = type === 'agent' ? `/api/agents/db/${id}` : 
                   type === 'instruction' ? `/api/instructions/db/${id}` :
                   `/api/skills/db/${id}`;
  
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `Failed to update ${type}`);
  }
}

export function DbEntityEditorPage({ type }: { type: EntityType }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [content, setContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['db-entity', type, id],
    queryFn: () => fetchDbEntity(type!, id!),
    enabled: !!type && !!id,
  });

  useEffect(() => {
    if (data?.content && !initialized) {
      setContent(data.content);
      setInitialized(true);
    }
  }, [data, initialized]);

  const saveMutation = useMutation({
    mutationFn: () => updateDbEntity(type!, id!, content),
    onSuccess: () => {
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['db-entity', type, id] });
      queryClient.invalidateQueries({ queryKey: [`${type}s-db`] });
    },
  });

  const handleContentChange = (val: string) => {
    setContent(val);
    setHasChanges(val !== data?.content);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <AlertCircle size={20} />
            <h2 className="font-bold">Error Loading Entity</h2>
          </div>
          <p className="text-slate-300">{(error as Error).message}</p>
          <button 
            onClick={() => navigate(-1)}
            className="text-blue-400 hover:underline mt-4 inline-block"
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col -m-6">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-700 bg-slate-800/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <Database size={16} className="text-violet-400" />
                <h1 className="text-xl font-bold">{data.name || data.id}</h1>
                <Badge variant="bg-violet-500/20 text-violet-400 text-[10px] uppercase">
                  DB {type}
                </Badge>
              </div>
              <p className="text-xs text-slate-500">
                Last modified: {new Date(data.updated_at).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setMode('edit')}
                className={cn(
                  'px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors',
                  mode === 'edit' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                )}
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => setMode('preview')}
                className={cn(
                  'px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors',
                  mode === 'preview' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                )}
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
            </div>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={!hasChanges || saveMutation.isPending}
              className={cn(
                'px-4 py-2 rounded-lg flex items-center gap-2 transition-colors',
                hasChanges 
                  ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              )}
            >
              {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>Save to Database</span>
            </button>
          </div>
        </div>
        
        {saveMutation.isSuccess && !hasChanges && (
          <div className="mt-2 text-xs text-green-400 flex items-center gap-1">
            <Check size={12} />
            <span>Successfully saved to database</span>
          </div>
        )}
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 overflow-hidden bg-slate-900">
        {mode === 'edit' ? (
          <textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="w-full h-full bg-transparent text-slate-100 p-6 resize-none font-mono text-sm focus:outline-none"
            spellCheck={false}
            placeholder={`Write your ${type} definition...`}
          />
        ) : (
          <div className="h-full overflow-auto p-8">
            <div className="max-w-4xl mx-auto">
              <MarkdownPreview content={content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Reuse Badge from components
function Badge({ children, variant, className }: { children: React.ReactNode; variant: string; className?: string }) {
  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', variant, className)}>
      {children}
    </span>
  );
}

// Simple Markdown Preview
function MarkdownPreview({ content }: { content: string }) {
  const html = content
    .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-8 mb-3 text-violet-400">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-8 mb-4 text-white">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-slate-800 p-4 rounded-lg my-4 overflow-x-auto font-mono text-sm border border-slate-700"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-slate-800 px-1.5 py-0.5 rounded font-mono text-sm text-violet-300">$1</code>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc text-slate-300">$1</li>')
    .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal text-slate-300">$1</li>')
    .replace(/^> (.*$)/gm, '<blockquote class="border-l-4 border-slate-600 pl-4 italic text-slate-400 my-2">$1</blockquote>')
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/\n/g, '<br/>');
  
  return (
    <div 
      className="prose prose-invert max-w-none text-slate-300 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: `<p class="mb-4">${html}</p>` }}
    />
  );
}
