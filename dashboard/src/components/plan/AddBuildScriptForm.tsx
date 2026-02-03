import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface AddBuildScriptFormProps {
  onAdd: (script: {
    name: string;
    description: string;
    command: string;
    directory: string;
    mcp_handle?: string;
  }) => void;
  isPending?: boolean;
}

export function AddBuildScriptForm({ onAdd, isPending }: AddBuildScriptFormProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [command, setCommand] = useState('');
  const [directory, setDirectory] = useState('./');
  const [mcpHandle, setMcpHandle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !command.trim()) {
      return;
    }

    onAdd({
      name: name.trim(),
      description: description.trim(),
      command: command.trim(),
      directory: directory.trim(),
      mcp_handle: mcpHandle.trim() || undefined,
    });

    // Reset form
    setName('');
    setDescription('');
    setCommand('');
    setDirectory('./');
    setMcpHandle('');
    setIsExpanded(false);
  };

  const handleCancel = () => {
    setName('');
    setDescription('');
    setCommand('');
    setDirectory('./');
    setMcpHandle('');
    setIsExpanded(false);
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
      >
        <Plus size={18} />
        Add New Build Script
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Add New Build Script</h3>
        <button
          type="button"
          onClick={handleCancel}
          className="p-1 hover:bg-slate-800 rounded transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Build Dashboard"
            required
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded focus:border-violet-500 focus:outline-none text-slate-200"
          />
        </div>

        {/* Directory */}
        <div>
          <label htmlFor="directory" className="block text-sm font-medium text-slate-300 mb-1">
            Directory <span className="text-red-400">*</span>
          </label>
          <input
            id="directory"
            type="text"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            placeholder="e.g., ./dashboard"
            required
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded focus:border-violet-500 focus:outline-none text-slate-200 font-mono text-sm"
          />
        </div>

        {/* Command */}
        <div className="md:col-span-2">
          <label htmlFor="command" className="block text-sm font-medium text-slate-300 mb-1">
            Command <span className="text-red-400">*</span>
          </label>
          <input
            id="command"
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="e.g., npm run build"
            required
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded focus:border-violet-500 focus:outline-none text-slate-200 font-mono text-sm"
          />
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <label htmlFor="description" className="block text-sm font-medium text-slate-300 mb-1">
            Description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of what this script does..."
            rows={2}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded focus:border-violet-500 focus:outline-none text-slate-200 resize-none"
          />
        </div>

        {/* MCP Handle (Optional) */}
        <div className="md:col-span-2">
          <label htmlFor="mcp-handle" className="block text-sm font-medium text-slate-300 mb-1">
            MCP Handle <span className="text-slate-500 text-xs">(optional)</span>
          </label>
          <input
            id="mcp-handle"
            type="text"
            value={mcpHandle}
            onChange={(e) => setMcpHandle(e.target.value)}
            placeholder="e.g., build_dashboard"
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded focus:border-violet-500 focus:outline-none text-slate-200 font-mono text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">
            Optional handle for referencing this script via MCP tools
          </p>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          type="submit"
          disabled={isPending || !name.trim() || !command.trim()}
          className={cn(
            'flex-1 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors font-medium',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isPending ? 'Adding...' : 'Add Script'}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
