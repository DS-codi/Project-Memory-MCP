export const config = {
  apiBaseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:3002',
  refreshInterval: 30000,
  maxActivityItems: 100,
};

// Convenience export for API base URL
export const API_BASE_URL = config.apiBaseUrl;
