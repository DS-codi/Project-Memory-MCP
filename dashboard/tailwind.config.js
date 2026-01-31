/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Status Colors
        status: {
          pending: '#6b7280',
          active: '#3b82f6',
          done: '#22c55e',
          blocked: '#ef4444',
        },
        // Priority Colors
        priority: {
          low: '#22c55e',
          medium: '#eab308',
          high: '#f97316',
          critical: '#ef4444',
        },
        // Agent Colors
        agent: {
          coordinator: '#8b5cf6',
          researcher: '#06b6d4',
          architect: '#f59e0b',
          executor: '#10b981',
          reviewer: '#6366f1',
          tester: '#ec4899',
          revisionist: '#f97316',
          archivist: '#64748b',
        },
      },
      animation: {
        shimmer: 'shimmer 2s infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  darkMode: 'class',
  plugins: [],
}
