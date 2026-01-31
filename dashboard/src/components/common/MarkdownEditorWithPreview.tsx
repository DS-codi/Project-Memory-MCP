import { useState } from 'react';
import { Eye, Edit3 } from 'lucide-react';
import { cn } from '@/utils/cn';

interface MarkdownEditorWithPreviewProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
  placeholder?: string;
  minHeight?: string;
}

// Simple Markdown Preview renderer
function renderMarkdown(content: string): string {
  return content
    // Headers
    .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-8 mb-3 text-blue-400">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-8 mb-4 text-white">$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, 
      '<pre class="bg-slate-900 p-4 rounded-lg my-4 overflow-x-auto font-mono text-sm border border-slate-700"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, 
      '<code class="bg-slate-900 px-1.5 py-0.5 rounded font-mono text-sm text-blue-300">$1</code>')
    // Lists
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Blockquotes
    .replace(/^> (.*$)/gm, 
      '<blockquote class="border-l-4 border-slate-600 pl-4 italic text-slate-400 my-2">$1</blockquote>')
    // Variables (highlight template variables)
    .replace(/\{\{(\w+)\}\}/g, 
      '<span class="bg-amber-500/20 text-amber-300 px-1 rounded font-mono">{{$1}}</span>')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="mb-4">')
    .replace(/\n/g, '<br/>');
}

export function MarkdownEditorWithPreview({ 
  content, 
  onChange, 
  className,
  placeholder = 'Write your content in Markdown...',
  minHeight = '300px'
}: MarkdownEditorWithPreviewProps) {
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');

  return (
    <div className={cn('flex flex-col border border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-1 bg-slate-900 rounded-lg p-0.5">
          <button
            onClick={() => setMode('edit')}
            className={cn(
              'px-3 py-1 rounded text-xs flex items-center gap-1.5 transition-colors',
              mode === 'edit' 
                ? 'bg-slate-700 text-white' 
                : 'text-slate-400 hover:text-white'
            )}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={() => setMode('split')}
            className={cn(
              'px-3 py-1 rounded text-xs transition-colors',
              mode === 'split' 
                ? 'bg-slate-700 text-white' 
                : 'text-slate-400 hover:text-white'
            )}
          >
            Split
          </button>
          <button
            onClick={() => setMode('preview')}
            className={cn(
              'px-3 py-1 rounded text-xs flex items-center gap-1.5 transition-colors',
              mode === 'preview' 
                ? 'bg-slate-700 text-white' 
                : 'text-slate-400 hover:text-white'
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
        </div>

        <span className="text-xs text-slate-500">
          {content.length} characters
        </span>
      </div>

      {/* Content Area */}
      <div 
        className="flex flex-1"
        style={{ minHeight }}
      >
        {/* Editor */}
        {(mode === 'edit' || mode === 'split') && (
          <textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            className={cn(
              'bg-slate-900 text-slate-100 p-4 resize-none font-mono text-sm focus:outline-none',
              mode === 'split' ? 'w-1/2 border-r border-slate-700' : 'w-full'
            )}
            style={{ minHeight }}
          />
        )}

        {/* Preview */}
        {(mode === 'preview' || mode === 'split') && (
          <div 
            className={cn(
              'overflow-auto p-4 bg-slate-850',
              mode === 'split' ? 'w-1/2' : 'w-full'
            )}
            style={{ minHeight }}
          >
            {content ? (
              <div 
                className="prose prose-invert max-w-none text-slate-300 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: `<p class="mb-4">${renderMarkdown(content)}</p>` }}
              />
            ) : (
              <p className="text-slate-500 italic">Nothing to preview</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MarkdownEditorWithPreview;
