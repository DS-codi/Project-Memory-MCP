import { useState } from 'react';
import { HelpCircle, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

interface GlobPatternInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const COMMON_PATTERNS = [
  { pattern: '**/*', description: 'All files' },
  { pattern: 'src/**/*.ts', description: 'TypeScript files in src' },
  { pattern: 'src/**/*.tsx', description: 'React components' },
  { pattern: '**/*.test.ts', description: 'Test files' },
  { pattern: 'server/**/*', description: 'Server code' },
  { pattern: 'dashboard/**/*', description: 'Dashboard code' },
  { pattern: '**/*.md', description: 'Markdown files' },
  { pattern: '**/api/**/*', description: 'API routes' },
  { pattern: '**/components/**/*', description: 'Components' },
];

// Simple glob pattern validator
function validateGlobPattern(pattern: string): { valid: boolean; error?: string } {
  if (!pattern) return { valid: true };
  
  // Check for invalid characters
  const invalidChars = /[<>"|?]/;
  if (invalidChars.test(pattern)) {
    return { valid: false, error: 'Contains invalid characters' };
  }

  // Check for unbalanced braces
  const openBraces = (pattern.match(/{/g) || []).length;
  const closeBraces = (pattern.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    return { valid: false, error: 'Unbalanced braces {}' };
  }

  // Check for unbalanced brackets
  const openBrackets = (pattern.match(/\[/g) || []).length;
  const closeBrackets = (pattern.match(/]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    return { valid: false, error: 'Unbalanced brackets []' };
  }

  return { valid: true };
}

// Get example matches for a pattern
function getExampleMatches(pattern: string): string[] {
  const examples: Record<string, string[]> = {
    '**/*': ['any/file.ts', 'src/index.ts'],
    'src/**/*.ts': ['src/app.ts', 'src/utils/helpers.ts'],
    'src/**/*.tsx': ['src/App.tsx', 'src/components/Button.tsx'],
    '**/*.test.ts': ['src/utils.test.ts', 'api/routes.test.ts'],
    'server/**/*': ['server/index.ts', 'server/routes/api.ts'],
    '**/*.md': ['README.md', 'docs/guide.md'],
    '**/api/**/*': ['src/api/users.ts', 'server/api/auth.ts'],
    '**/components/**/*': ['src/components/Button.tsx', 'ui/components/Modal.tsx'],
  };
  
  return examples[pattern] || [];
}

export function GlobPatternInput({ value, onChange, placeholder, className }: GlobPatternInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const validation = validateGlobPattern(value);
  const exampleMatches = getExampleMatches(value);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder || 'e.g., src/**/*.ts'}
          className={cn(
            'w-full bg-slate-900 border rounded px-3 py-2 text-sm font-mono focus:outline-none',
            validation.valid
              ? 'border-slate-700 focus:border-blue-500'
              : 'border-red-500 focus:border-red-400'
          )}
        />
        
        {/* Validation indicator */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {value && (
            validation.valid ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400" />
            )
          )}
        </div>
      </div>

      {/* Validation error */}
      {!validation.valid && validation.error && (
        <p className="text-xs text-red-400">{validation.error}</p>
      )}

      {/* Example matches */}
      {value && validation.valid && exampleMatches.length > 0 && (
        <div className="text-xs text-slate-400">
          <span className="text-slate-500">Matches:</span>{' '}
          {exampleMatches.join(', ')}
        </div>
      )}

      {/* Suggestions dropdown */}
      {showSuggestions && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto bg-slate-800 border border-slate-700 rounded-lg shadow-lg">
          <div className="p-2 text-xs text-slate-400 border-b border-slate-700 flex items-center gap-1">
            <HelpCircle className="w-3 h-3" />
            Common patterns
          </div>
          {COMMON_PATTERNS.map((item) => (
            <button
              key={item.pattern}
              onClick={() => {
                onChange(item.pattern);
                setShowSuggestions(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-slate-700 transition-colors"
            >
              <div className="font-mono text-sm text-blue-300">{item.pattern}</div>
              <div className="text-xs text-slate-500">{item.description}</div>
            </button>
          ))}
        </div>
      )}

      {/* Help text */}
      <div className="text-xs text-slate-500">
        <span className="font-semibold">Glob syntax:</span>{' '}
        <code className="bg-slate-800 px-1 rounded">*</code> matches any file,{' '}
        <code className="bg-slate-800 px-1 rounded">**</code> matches directories,{' '}
        <code className="bg-slate-800 px-1 rounded">{'*.{ts,tsx}'}</code> matches extensions
      </div>
    </div>
  );
}

export default GlobPatternInput;
