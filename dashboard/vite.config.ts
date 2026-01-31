import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Check if building for VS Code webview
const isWebview = process.env.BUILD_TARGET === 'webview';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: isWebview ? './' : '/',
  build: isWebview ? {
    outDir: 'dist-webview',
    rollupOptions: {
      output: {
        // Single file bundle for webview
        entryFileNames: 'webview.js',
        chunkFileNames: 'webview-[name].js',
        assetFileNames: 'webview-[name][extname]',
        manualChunks: undefined, // Disable code splitting for webview
      },
    },
    // Inline assets for webview
    assetsInlineLimit: 100000,
  } : {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  define: isWebview ? {
    'process.env.VSCODE_WEBVIEW': JSON.stringify(true),
  } : {},
});
