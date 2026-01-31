import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface PullCustomizationsDialogProps {
  isOpen: boolean;
  agentId: string;
  agentName: string;
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
}

interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'modified';
  lineNumber: number;
  content: string;
  selected?: boolean;
}

interface DiffHunk {
  lines: DiffLine[];
  startLine: number;
  endLine: number;
}

export const PullCustomizationsDialog = ({
  isOpen,
  agentId,
  agentName,
  workspaceId,
  workspaceName,
  onClose,
}: PullCustomizationsDialogProps) => {
  const [diffData, setDiffData] = useState<{
    templateContent: string;
    deployedContent: string;
    hunks: DiffHunk[];
  } | null>(null);
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch diff when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    
    const fetchDiff = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await axios.get(`/api/agents/${agentId}/diff/${workspaceId}`);
        const data = response.data;
        
        // Parse the diff into hunks
        const hunks = parseDiffIntoHunks(data.templateContent, data.deployedContent);
        
        setDiffData({
          templateContent: data.templateContent,
          deployedContent: data.deployedContent,
          hunks,
        });
        
        // By default, select all added lines from deployed
        const initialSelected = new Set<number>();
        hunks.forEach(hunk => {
          hunk.lines.forEach((line, idx) => {
            if (line.type === 'added') {
              initialSelected.add(hunk.startLine + idx);
            }
          });
        });
        setSelectedLines(initialSelected);
      } catch (err) {
        setError('Failed to fetch diff. Make sure both template and deployed agent exist.');
        console.error('Error fetching diff:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDiff();
  }, [isOpen, agentId, workspaceId]);

  const mergeMutation = useMutation({
    mutationFn: async (mergedContent: string) => {
      return axios.put(`/api/agents/${agentId}`, { content: mergedContent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      onClose();
    },
  });

  const toggleLine = (lineNum: number) => {
    setSelectedLines(prev => {
      const next = new Set(prev);
      if (next.has(lineNum)) {
        next.delete(lineNum);
      } else {
        next.add(lineNum);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (!diffData) return;
    const all = new Set<number>();
    diffData.hunks.forEach(hunk => {
      hunk.lines.forEach((line, idx) => {
        if (line.type === 'added') {
          all.add(hunk.startLine + idx);
        }
      });
    });
    setSelectedLines(all);
  };

  const selectNone = () => {
    setSelectedLines(new Set());
  };

  // Generate merged content based on selected lines
  const mergedContent = useMemo(() => {
    if (!diffData) return '';
    
    const templateLines = diffData.templateContent.split('\n');
    const deployedLines = diffData.deployedContent.split('\n');
    
    // Simple merge strategy: start with template, add selected new lines from deployed
    // This is a simplified approach - a real implementation would be more sophisticated
    const result = [...templateLines];
    
    // Find new content in deployed that was added (lines that exist in deployed but not template)
    const templateSet = new Set(templateLines.map(l => l.trim()));
    const newLines: string[] = [];
    
    deployedLines.forEach((line, idx) => {
      if (!templateSet.has(line.trim()) && selectedLines.has(idx)) {
        newLines.push(line);
      }
    });
    
    // Append new content at the end (before closing markers if any)
    if (newLines.length > 0) {
      // Find a good insertion point (before any trailing empty lines or markers)
      let insertPoint = result.length;
      while (insertPoint > 0 && result[insertPoint - 1].trim() === '') {
        insertPoint--;
      }
      result.splice(insertPoint, 0, '', '## Merged Customizations', '', ...newLines);
    }
    
    return result.join('\n');
  }, [diffData, selectedLines]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Pull Customizations
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Merge changes from <span className="font-medium">{workspaceName}</span> back to template
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            {isLoading && (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                {error}
              </div>
            )}

            {diffData && !isLoading && (
              <div className="space-y-4">
                {/* Selection controls */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedLines.size} lines selected for merge
                    </span>
                    <button
                      onClick={selectAll}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Select All
                    </button>
                    <button
                      onClick={selectNone}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-green-100 dark:bg-green-900/40 border border-green-400" />
                      Added in workspace
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-red-100 dark:bg-red-900/40 border border-red-400" />
                      Removed from template
                    </span>
                  </div>
                </div>

                {/* Diff view */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">
                    {agentName} - Deployed Changes
                  </div>
                  <div className="overflow-x-auto">
                    <pre className="text-sm leading-6">
                      {diffData.hunks.map((hunk, hunkIdx) => (
                        <div key={hunkIdx}>
                          {hunk.lines.map((line, lineIdx) => {
                            const absoluteLine = hunk.startLine + lineIdx;
                            const isSelected = selectedLines.has(absoluteLine);
                            const canSelect = line.type === 'added';
                            
                            return (
                              <div
                                key={lineIdx}
                                className={`flex ${
                                  line.type === 'added'
                                    ? 'bg-green-50 dark:bg-green-900/20'
                                    : line.type === 'removed'
                                    ? 'bg-red-50 dark:bg-red-900/20'
                                    : ''
                                } ${canSelect ? 'cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/40' : ''}`}
                                onClick={() => canSelect && toggleLine(absoluteLine)}
                              >
                                {/* Selection checkbox */}
                                <div className="w-8 flex items-center justify-center border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                  {canSelect && (
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleLine(absoluteLine)}
                                      className="rounded text-blue-600 focus:ring-blue-500"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  )}
                                </div>
                                
                                {/* Line number */}
                                <div className="w-12 px-2 text-right text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 select-none">
                                  {line.lineNumber}
                                </div>
                                
                                {/* Change indicator */}
                                <div className="w-6 text-center font-mono">
                                  {line.type === 'added' && (
                                    <span className="text-green-600">+</span>
                                  )}
                                  {line.type === 'removed' && (
                                    <span className="text-red-600">-</span>
                                  )}
                                </div>
                                
                                {/* Content */}
                                <code className={`flex-1 px-2 ${
                                  line.type === 'added'
                                    ? 'text-green-800 dark:text-green-300'
                                    : line.type === 'removed'
                                    ? 'text-red-800 dark:text-red-300'
                                    : 'text-gray-700 dark:text-gray-300'
                                }`}>
                                  {line.content || ' '}
                                </code>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </pre>
                  </div>
                </div>

                {/* Preview section */}
                {selectedLines.size > 0 && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Preview - Content to be merged
                    </div>
                    <div className="p-4 max-h-48 overflow-auto bg-gray-50 dark:bg-gray-900">
                      <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {Array.from(selectedLines)
                          .sort((a, b) => a - b)
                          .map(lineNum => {
                            const deployedLines = diffData.deployedContent.split('\n');
                            return deployedLines[lineNum] || '';
                          })
                          .join('\n')}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => mergeMutation.mutate(mergedContent)}
              disabled={mergeMutation.isPending || selectedLines.size === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {mergeMutation.isPending ? 'Merging...' : `Merge ${selectedLines.size} Lines`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to parse diff into hunks
function parseDiffIntoHunks(template: string, deployed: string): DiffHunk[] {
  const templateLines = template.split('\n');
  const deployedLines = deployed.split('\n');
  
  const hunks: DiffHunk[] = [];
  const lines: DiffLine[] = [];
  
  // Simple line-by-line comparison
  const maxLines = Math.max(templateLines.length, deployedLines.length);
  const templateSet = new Set(templateLines.map(l => l.trim()));
  const deployedSet = new Set(deployedLines.map(l => l.trim()));
  
  // Process deployed lines and mark as added if not in template
  deployedLines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!templateSet.has(trimmed) && trimmed !== '') {
      lines.push({
        type: 'added',
        lineNumber: idx + 1,
        content: line,
      });
    } else {
      lines.push({
        type: 'context',
        lineNumber: idx + 1,
        content: line,
      });
    }
  });
  
  // Add removed lines (in template but not in deployed)
  templateLines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!deployedSet.has(trimmed) && trimmed !== '') {
      // Insert at appropriate position
      lines.push({
        type: 'removed',
        lineNumber: idx + 1,
        content: line,
      });
    }
  });
  
  // Create single hunk with all changes
  if (lines.length > 0) {
    hunks.push({
      lines: lines.filter(l => l.type !== 'context' || lines.some(ol => ol.type !== 'context')),
      startLine: 0,
      endLine: maxLines,
    });
  }
  
  return hunks;
}
