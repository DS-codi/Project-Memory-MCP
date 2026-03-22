import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Upload, 
  Search, 
  FileCode, 
  Globe, 
  Database,
  RefreshCw,
  Edit3
} from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/formatters';

interface InstructionFile {
  id: string;
  name: string;
  filename: string;
  applyTo?: string;
  content: string;
  isPathSpecific: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface DbInstruction {
  id: string;
  filename: string;
  applies_to: string;
  content: string;
  created_at: string;
  updated_at: string;
}

async function fetchInstructions(): Promise<{ instructions: InstructionFile[]; total: number }> {
  const res = await fetch('/api/instructions');
  if (!res.ok) throw new Error('Failed to fetch instructions');
  return res.json();
}

async function fetchDbInstructions(): Promise<{ instructions: DbInstruction[]; total: number }> {
  const res = await fetch('/api/instructions/db');
  if (!res.ok) throw new Error('Failed to fetch DB instructions');
  return res.json();
}

async function deleteInstruction(id: string): Promise<void> {
  const res = await fetch(`/api/instructions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete instruction');
}

async function createInstruction(data: { id: string; applyTo?: string; content: string }): Promise<InstructionFile> {
  const res = await fetch('/api/instructions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create instruction');
  const result = await res.json();
  return result.instruction;
}

export function InstructionsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'templates' | 'database'>('templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInstruction, setSelectedInstruction] = useState<InstructionFile | DbInstruction | null>(null);

  const { 
    data: templateData, 
    isLoading: isLoadingTemplates, 
    error: templateError,
    refetch: refetchTemplates
  } = useQuery({
    queryKey: ['instructions'],
    queryFn: fetchInstructions,
    enabled: viewMode === 'templates',
  });

  const {
    data: dbData,
    isLoading: isLoadingDb,
    error: dbError,
    refetch: refetchDb
  } = useQuery({
    queryKey: ['instructions-db'],
    queryFn: fetchDbInstructions,
    enabled: viewMode === 'database',
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInstruction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructions'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: createInstruction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructions'] });
      setShowCreateModal(false);
    },
  });

  const isLoading = viewMode === 'templates' ? isLoadingTemplates : isLoadingDb;
  const error = viewMode === 'templates' ? templateError : dbError;

  const filteredInstructions = viewMode === 'templates' 
    ? (templateData?.instructions.filter(i =>
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.applyTo?.toLowerCase().includes(searchQuery.toLowerCase())
      ) ?? [])
    : (dbData?.instructions.filter(i =>
        i.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.applies_to?.toLowerCase().includes(searchQuery.toLowerCase())
      ) ?? []);

  // Separate general from path-specific (templates only)
  const generalInstructions = viewMode === 'templates' 
    ? (filteredInstructions as InstructionFile[]).filter(i => !i.isPathSpecific)
    : [];
  const pathSpecificInstructions = viewMode === 'templates'
    ? (filteredInstructions as InstructionFile[]).filter(i => i.isPathSpecific)
    : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 p-4">
        Failed to load instructions: {(error as Error).message}
      </div>
    );
  }

  const InstructionCard = ({ instruction }: { instruction: InstructionFile }) => (
    <div
      className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors cursor-pointer"
      onClick={() => setSelectedInstruction(instruction)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            instruction.isPathSpecific ? "bg-cyan-500/20" : "bg-amber-500/20"
          )}>
            {instruction.isPathSpecific ? (
              <FileCode className="w-5 h-5 text-cyan-400" />
            ) : (
              <Globe className="w-5 h-5 text-amber-400" />
            )}
          </div>
          <div>
            <h3 className="font-medium text-white">{instruction.name}</h3>
            {instruction.applyTo && (
              <div className="mt-1 inline-flex max-w-full">
                <code className="text-xs text-slate-300 bg-slate-900 px-2 py-1 rounded font-mono break-words whitespace-normal">
                  {instruction.applyTo}
                </code>
              </div>
            )}
          </div>
        </div>
        <Badge className={cn(
          instruction.isPathSpecific
            ? "bg-cyan-500/20 text-cyan-400"
            : "bg-amber-500/20 text-amber-400"
        )}>
          {instruction.isPathSpecific ? 'path-specific' : 'general'}
        </Badge>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{instruction.updatedAt && formatRelative(instruction.updatedAt)}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete instruction "${instruction.name}"?`)) {
              deleteMutation.mutate(instruction.id);
            }
          }}
          className="p-1 hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const DbInstructionCard = ({ instruction }: { instruction: DbInstruction }) => (
    <div
      className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-amber-500/50 transition-colors"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-500/20">
            <Database className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-medium text-white">{instruction.filename}</h3>
            <div className="mt-1 inline-flex max-w-full">
              <code className="text-xs text-slate-300 bg-slate-900 px-2 py-1 rounded font-mono break-words whitespace-normal">
                {instruction.applies_to}
              </code>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-slate-500">{formatRelative(instruction.updated_at)}</span>
        <button 
          onClick={() => navigate(`/instructions/db/${instruction.filename}`)}
          className="px-3 py-1.5 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2 text-sm text-white"
        >
          <Edit3 size={14} />
          Edit Definition
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Instruction Files</h1>
          <p className="text-slate-400 mt-1">
            Coding guidelines for VS Code Copilot
          </p>
        </div>
        <div className="flex items-center gap-3">
          {viewMode === 'templates' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Instruction
            </button>
          )}
          <button
            onClick={() => viewMode === 'templates' ? refetchTemplates() : refetchDb()}
            className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex p-1 bg-slate-800 rounded-lg w-fit">
        <button
          onClick={() => setViewMode('templates')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md transition-all",
            viewMode === 'templates' 
              ? "bg-slate-700 text-white shadow-sm" 
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <FileCode size={18} />
          <span>Templates (Disk)</span>
        </button>
        <button
          onClick={() => setViewMode('database')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md transition-all",
            viewMode === 'database' 
              ? "bg-slate-700 text-white shadow-sm" 
              : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Database size={18} />
          <span>Definitions (DB)</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search instructions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
        />
      </div>

      {viewMode === 'templates' ? (
        <>
          {/* General Instructions */}
          {generalInstructions.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Globe className="w-5 h-5 text-amber-400" />
                General Instructions
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {generalInstructions.map((instruction) => (
                  <InstructionCard key={instruction.id} instruction={instruction} />
                ))}
              </div>
            </div>
          )}

          {/* Path-Specific Instructions */}
          {pathSpecificInstructions.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <FileCode className="w-5 h-5 text-cyan-400" />
                Path-Specific Instructions
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pathSpecificInstructions.map((instruction) => (
                  <InstructionCard key={instruction.id} instruction={instruction} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(filteredInstructions as DbInstruction[]).map((instruction) => (
            <DbInstructionCard key={instruction.id} instruction={instruction} />
          ))}
        </div>
      )}

      {filteredInstructions.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No instructions found</p>
          {viewMode === 'templates' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-2 text-amber-400 hover:text-amber-300"
            >
              Create your first instruction
            </button>
          )}
        </div>
      )}

      {/* Selected Instruction Preview (templates only) */}
      {selectedInstruction && viewMode === 'templates' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedInstruction(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{(selectedInstruction as InstructionFile).name}</h2>
              <button onClick={() => setSelectedInstruction(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            {(selectedInstruction as InstructionFile).applyTo && (
              <div className="mb-4 p-2 bg-slate-900 rounded-lg">
                <span className="text-slate-400 text-sm">Applies to: </span>
                <code className="text-cyan-400">{(selectedInstruction as InstructionFile).applyTo}</code>
              </div>
            )}
            <pre className="bg-slate-900 p-4 rounded-lg text-sm text-slate-300 overflow-auto">
              {selectedInstruction.content}
            </pre>
            <div className="mt-4 flex gap-2">
              <button className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg">
                <Upload className="w-4 h-4" />
                Deploy to Workspaces
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal (templates only) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Create New Instruction</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                createMutation.mutate({
                  id: formData.get('id') as string,
                  applyTo: formData.get('applyTo') as string || undefined,
                  content: formData.get('content') as string,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm text-slate-400 mb-1">ID (filename)</label>
                <input
                  name="id"
                  required
                  placeholder="my-instructions"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Apply To (glob pattern, optional)</label>
                <input
                  name="applyTo"
                  placeholder="**/*.test.ts"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Leave empty for general instructions. Use glob patterns for path-specific.
                </p>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Content</label>
                <textarea
                  name="content"
                  required
                  rows={6}
                  placeholder="# Instruction content..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
