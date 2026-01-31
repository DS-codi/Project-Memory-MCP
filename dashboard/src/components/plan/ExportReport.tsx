import { useState } from 'react';
import { Download, FileText, FileJson, Loader2, Check, X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ExportReportProps {
  workspaceId: string;
  planId: string;
  planTitle: string;
}

type ExportFormat = 'markdown' | 'json';

export function ExportReport({ workspaceId, planId, planTitle }: ExportReportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [exportMessage, setExportMessage] = useState('');

  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);
    setExportStatus('idle');
    setExportMessage('');

    try {
      const endpoint = format === 'markdown' 
        ? `/api/reports/${workspaceId}/${planId}/markdown`
        : `/api/reports/${workspaceId}/${planId}/json`;
      
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Failed to generate report');
      
      const data = await res.json();
      
      // Create and download file
      const content = format === 'markdown' 
        ? data.content 
        : JSON.stringify(data, null, 2);
      
      const filename = format === 'markdown'
        ? `${planTitle.replace(/[^a-z0-9]/gi, '_')}_report.md`
        : `${planTitle.replace(/[^a-z0-9]/gi, '_')}_report.json`;
      
      const blob = new Blob([content], { 
        type: format === 'markdown' ? 'text/markdown' : 'application/json' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setExportStatus('success');
      setExportMessage(`Exported as ${filename}`);
      
      // Auto-close after success
      setTimeout(() => {
        setIsOpen(false);
        setExportStatus('idle');
      }, 2000);
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('error');
      setExportMessage('Failed to export report');
    } finally {
      setIsExporting(false);
    }
  };

  const copyToClipboard = async (format: ExportFormat) => {
    setIsExporting(true);
    setExportStatus('idle');

    try {
      const endpoint = format === 'markdown' 
        ? `/api/reports/${workspaceId}/${planId}/markdown`
        : `/api/reports/${workspaceId}/${planId}/json`;
      
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Failed to generate report');
      
      const data = await res.json();
      const content = format === 'markdown' ? data.content : JSON.stringify(data, null, 2);
      
      await navigator.clipboard.writeText(content);
      
      setExportStatus('success');
      setExportMessage('Copied to clipboard!');
      
      setTimeout(() => {
        setExportStatus('idle');
      }, 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      setExportStatus('error');
      setExportMessage('Failed to copy');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm',
          'bg-slate-700 hover:bg-slate-600 text-slate-200'
        )}
      >
        <Download size={16} />
        Export Report
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
            <div className="p-3 border-b border-slate-700">
              <h3 className="font-semibold text-sm">Export Plan Report</h3>
              <p className="text-xs text-slate-400 mt-1">
                Download or copy the full plan report
              </p>
            </div>

            {/* Status Message */}
            {exportStatus !== 'idle' && (
              <div className={cn(
                'mx-3 mt-3 p-2 rounded text-xs flex items-center gap-2',
                exportStatus === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
              )}>
                {exportStatus === 'success' ? <Check size={14} /> : <X size={14} />}
                {exportMessage}
              </div>
            )}

            <div className="p-3 space-y-2">
              {/* Markdown Export */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText size={14} className="text-blue-400" />
                  Markdown Report
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExport('markdown')}
                    disabled={isExporting}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-colors',
                      'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300',
                      isExporting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    Download
                  </button>
                  <button
                    onClick={() => copyToClipboard('markdown')}
                    disabled={isExporting}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-colors',
                      'bg-slate-700 hover:bg-slate-600 text-slate-300',
                      isExporting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* JSON Export */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileJson size={14} className="text-amber-400" />
                  JSON Data
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExport('json')}
                    disabled={isExporting}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-colors',
                      'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300',
                      isExporting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    Download
                  </button>
                  <button
                    onClick={() => copyToClipboard('json')}
                    disabled={isExporting}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded text-xs transition-colors',
                      'bg-slate-700 hover:bg-slate-600 text-slate-300',
                      isExporting && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-slate-700">
              <p className="text-xs text-slate-500">
                Reports include: steps, sessions, handoffs, and audit log
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
