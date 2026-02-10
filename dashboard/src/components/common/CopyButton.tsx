import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  size?: number;
}

export function CopyButton({ text, label, className, size = 14 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : `Copy ${label || text}`}
      className={cn(
        'p-1 rounded transition-colors',
        copied
          ? 'text-emerald-400'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50',
        className
      )}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  );
}
