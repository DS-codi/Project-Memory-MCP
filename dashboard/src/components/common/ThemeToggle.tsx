import React, { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { cn } from '../../utils/cn';

type Theme = 'light' | 'dark' | 'system';

interface ThemeToggleProps {
  className?: string;
  variant?: 'icon' | 'buttons' | 'dropdown';
}

// Get the stored theme or default to system
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

// Apply theme to document
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (theme === 'dark' || (theme === 'system' && prefersDark)) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem('theme', newTheme);
    setThemeState(newTheme);
  };

  return { theme, setTheme };
}

export function ThemeToggle({ className, variant = 'icon' }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  if (variant === 'icon') {
    const handleClick = () => {
      // Cycle through: light -> dark -> system
      const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
      setTheme(next);
    };

    return (
      <button
        onClick={handleClick}
        className={cn(
          'p-2 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
          className
        )}
        title={`Theme: ${theme}`}
        aria-label={`Current theme: ${theme}. Click to change.`}
      >
        {theme === 'light' && <Sun className="h-5 w-5" />}
        {theme === 'dark' && <Moon className="h-5 w-5" />}
        {theme === 'system' && <Monitor className="h-5 w-5" />}
      </button>
    );
  }

  if (variant === 'buttons') {
    const options: { value: Theme; icon: React.ReactNode; label: string }[] = [
      { value: 'light', icon: <Sun className="h-4 w-4" />, label: 'Light' },
      { value: 'dark', icon: <Moon className="h-4 w-4" />, label: 'Dark' },
      { value: 'system', icon: <Monitor className="h-4 w-4" />, label: 'System' },
    ];

    return (
      <div className={cn('flex rounded-lg border border-gray-200 dark:border-gray-700 p-1', className)}>
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              theme === option.value
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            )}
            aria-pressed={theme === option.value}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  // Dropdown variant
  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {theme === 'light' && <Sun className="h-5 w-5" />}
        {theme === 'dark' && <Moon className="h-5 w-5" />}
        {theme === 'system' && <Monitor className="h-5 w-5" />}
        <span className="text-sm capitalize">{theme}</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown menu */}
          <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1">
            <button
              onClick={() => { setTheme('light'); setIsOpen(false); }}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700',
                theme === 'light' && 'text-blue-600 dark:text-blue-400'
              )}
              role="option"
              aria-selected={theme === 'light'}
            >
              <Sun className="h-4 w-4" />
              Light
            </button>
            <button
              onClick={() => { setTheme('dark'); setIsOpen(false); }}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700',
                theme === 'dark' && 'text-blue-600 dark:text-blue-400'
              )}
              role="option"
              aria-selected={theme === 'dark'}
            >
              <Moon className="h-4 w-4" />
              Dark
            </button>
            <button
              onClick={() => { setTheme('system'); setIsOpen(false); }}
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700',
                theme === 'system' && 'text-blue-600 dark:text-blue-400'
              )}
              role="option"
              aria-selected={theme === 'system'}
            >
              <Monitor className="h-4 w-4" />
              System
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ThemeToggle;
