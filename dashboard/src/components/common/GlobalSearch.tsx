import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, 
  FolderOpen, 
  FileText, 
  User, 
  ArrowRight,
  Loader2,
  Command,
} from 'lucide-react';
import { cn } from '@/utils/cn';

interface SearchResult {
  type: 'workspace' | 'plan' | 'agent' | 'step';
  id: string;
  title: string;
  subtitle?: string;
  path: string;
  matchedField: string;
  score: number;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

async function performSearch(query: string): Promise<SearchResult[]> {
  if (!query.trim() || query.length < 2) return [];
  
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return data.results;
}

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: results, isLoading } = useQuery({
    queryKey: ['global-search', query],
    queryFn: () => performSearch(query),
    enabled: query.length >= 2,
    staleTime: 1000 * 10,
  });

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, (results?.length || 1) - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results && results[selectedIndex]) {
          navigateToResult(results[selectedIndex]);
        }
        break;
    }
  }, [isOpen, results, selectedIndex, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const navigateToResult = (result: SearchResult) => {
    onClose();
    navigate(result.path);
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'workspace':
        return <FolderOpen className="w-5 h-5 text-blue-400" />;
      case 'plan':
        return <FileText className="w-5 h-5 text-green-400" />;
      case 'agent':
        return <User className="w-5 h-5 text-purple-400" />;
      case 'step':
        return <ArrowRight className="w-5 h-5 text-amber-400" />;
      default:
        return <FileText className="w-5 h-5 text-slate-400" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] z-50"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 w-full max-w-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search workspaces, plans, agents..."
            className="flex-1 bg-transparent text-lg focus:outline-none placeholder:text-slate-500"
          />
          {isLoading && <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />}
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 bg-slate-700 rounded text-xs text-slate-400">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-auto">
          {query.length < 2 ? (
            <div className="p-8 text-center text-slate-500">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Type at least 2 characters to search</p>
              <p className="text-sm mt-2">
                Search across workspaces, plans, agents, and steps
              </p>
            </div>
          ) : results && results.length > 0 ? (
            <div className="py-2">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => navigateToResult(result)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                    index === selectedIndex
                      ? 'bg-blue-500/20 text-white'
                      : 'hover:bg-slate-700/50'
                  )}
                >
                  {getResultIcon(result.type)}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{result.title}</div>
                    {result.subtitle && (
                      <div className="text-sm text-slate-400 truncate">
                        {result.subtitle}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-0.5">
                      Matched in: {result.matchedField}
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 uppercase">
                    {result.type}
                  </span>
                </button>
              ))}
            </div>
          ) : query.length >= 2 && !isLoading ? (
            <div className="p-8 text-center text-slate-500">
              <p>No results found for "{query}"</p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-700 bg-slate-900/50 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-700 rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-slate-700 rounded">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-700 rounded">↵</kbd>
              to select
            </span>
          </div>
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3" />K to open search
          </span>
        </div>
      </div>
    </div>
  );
}

// Hook for global keyboard shortcut
export function useGlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
}

export default GlobalSearch;
