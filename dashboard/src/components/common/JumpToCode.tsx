import { useVSCodeBridge } from '../../api/vscode-bridge';

interface JumpToCodeButtonProps {
  filePath: string;
  line?: number;
  column?: number;
  className?: string;
  variant?: 'icon' | 'text' | 'full';
  label?: string;
}

export const JumpToCodeButton = ({
  filePath,
  line,
  column,
  className = '',
  variant = 'icon',
  label = 'Open in Editor',
}: JumpToCodeButtonProps) => {
  const { isWebview, jumpToCode } = useVSCodeBridge();

  // In browser mode, show file path as tooltip
  const handleClick = () => {
    if (isWebview) {
      jumpToCode(filePath, line, column);
    } else {
      // Copy file path to clipboard in browser mode
      navigator.clipboard.writeText(
        line ? `${filePath}:${line}${column ? `:${column}` : ''}` : filePath
      );
    }
  };

  const baseClasses = 'inline-flex items-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
  
  const variantClasses: Record<'icon' | 'text' | 'full', string> = {
    icon: 'p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20',
    text: 'text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300',
    full: 'px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200',
  };

  const Icon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );

  // Format file location for display
  const fileLocation = line 
    ? `${filePath.split(/[/\\]/).pop()}:${line}${column ? `:${column}` : ''}`
    : filePath.split(/[/\\]/).pop();

  return (
    <button
      onClick={handleClick}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      title={isWebview ? `Open ${fileLocation} in editor` : `Copy path: ${filePath}`}
    >
      {variant === 'icon' && Icon}
      {variant === 'text' && (
        <>
          {Icon}
          <span className="ml-1">{label}</span>
        </>
      )}
      {variant === 'full' && (
        <>
          {Icon}
          <span className="ml-2">{fileLocation}</span>
        </>
      )}
    </button>
  );
};

interface FilePathLinkProps {
  filePath: string;
  line?: number;
  displayPath?: string;
  className?: string;
}

export const FilePathLink = ({
  filePath,
  line,
  displayPath,
  className = '',
}: FilePathLinkProps) => {
  const { isWebview, jumpToCode } = useVSCodeBridge();
  
  const shortPath = displayPath || filePath.split(/[/\\]/).slice(-2).join('/');
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isWebview) {
      jumpToCode(filePath, line);
    } else {
      navigator.clipboard.writeText(filePath);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline ${className}`}
      title={isWebview ? `Open in editor` : `Copy path: ${filePath}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="font-mono text-xs">{shortPath}{line ? `:${line}` : ''}</span>
    </button>
  );
};

interface RevealInExplorerButtonProps {
  filePath: string;
  className?: string;
}

export const RevealInExplorerButton = ({
  filePath,
  className = '',
}: RevealInExplorerButtonProps) => {
  const { isWebview, revealInExplorer } = useVSCodeBridge();

  if (!isWebview) return null;

  return (
    <button
      onClick={() => revealInExplorer(filePath)}
      className={`inline-flex items-center gap-1 p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors ${className}`}
      title="Reveal in Explorer"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    </button>
  );
};
