import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ── Login page served to unauthenticated visitors ─────────────────────────────
const LOGIN_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Project Memory</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f172a; color: #e2e8f0;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #1e293b; border: 1px solid #334155;
      border-radius: 12px; padding: 32px; width: 320px;
    }
    h2 { font-size: 18px; color: #f1f5f9; margin-bottom: 20px; }
    input {
      display: block; width: 100%;
      background: #0f172a; border: 1px solid #475569;
      color: #e2e8f0; padding: 10px 12px;
      border-radius: 6px; font-size: 14px;
      margin-bottom: 12px; outline: none;
    }
    input:focus { border-color: #3b82f6; }
    button {
      width: 100%; background: #3b82f6; color: #fff;
      border: none; padding: 10px; border-radius: 6px;
      font-size: 14px; cursor: pointer;
    }
    button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Project Memory</h2>
    <form method="GET">
      <input type="password" name="token" placeholder="API key" autofocus />
      <button type="submit">Unlock</button>
    </form>
  </div>
</body>
</html>`;

// ── Parse cookie header ───────────────────────────────────────────────────────
function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const chunk of header.split(';')) {
    const eq = chunk.indexOf('=');
    if (eq < 0) continue;
    out[chunk.slice(0, eq).trim()] = chunk.slice(eq + 1).trim();
  }
  return out;
}

// ── Stub Capacitor-native plugins so the dev server doesn't error ─────────────
const NATIVE_STUBS = [
  '@capacitor-community/mdns',
  '@capacitor-community/secure-storage-plugin',
  '@capacitor-mlkit/barcode-scanning',
];

function capacitorStubPlugin() {
  const ids = new Set(NATIVE_STUBS);
  return {
    name: 'capacitor-native-stubs',
    resolveId(id: string) {
      if (ids.has(id)) return '\0' + id;
    },
    load(id: string) {
      if (id.startsWith('\0') && ids.has(id.slice(1))) {
        // Provide localStorage-backed stubs so auth/config works in the browser
        return `
export const SecureStoragePlugin = {
  get: ({ key }) => Promise.resolve({ value: localStorage.getItem('cap_' + key) }),
  set: ({ key, value }) => { localStorage.setItem('cap_' + key, value); return Promise.resolve(); },
  remove: ({ key }) => { localStorage.removeItem('cap_' + key); return Promise.resolve(); },
};
const noop = () => Promise.resolve({});
const stub = new Proxy({}, { get: () => noop });
export default stub;
export const Plugins = {};
export const BarcodeScanner = stub;
export const Mdns = stub;
`;
      }
    },
  };
}

// ── Auth middleware plugin ────────────────────────────────────────────────────
function devNetworkAuthPlugin(apiKey: string) {
  return {
    name: 'dev-network-auth',
    configureServer(server: { middlewares: { use: (fn: any) => void } }) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? '/';

        // Always pass Vite internals through unauthenticated
        if (
          url.startsWith('/@') ||
          url.startsWith('/node_modules') ||
          url === '/__vite_ping'
        ) {
          return next();
        }

        // Cookie already set?
        const cookies = parseCookies(req.headers.cookie ?? '');
        if (cookies['dev_token'] === apiKey) return next();

        // Token supplied in query string — upgrade to cookie + redirect to clean URL
        try {
          const parsed = new URL(url, 'http://x');
          const tok = parsed.searchParams.get('token');
          if (tok === apiKey) {
            parsed.searchParams.delete('token');
            const clean = parsed.pathname + (parsed.search || '');
            res.setHeader('Set-Cookie', `dev_token=${apiKey}; Path=/; HttpOnly; SameSite=Lax`);
            res.writeHead(302, { Location: clean });
            return res.end();
          }
        } catch (_) {
          // malformed URL — fall through to login
        }

        // Serve login page
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.statusCode = 200;
        res.end(LOGIN_HTML);
      });
    },
  };
}

// ── Load or generate the network API key ─────────────────────────────────────
// Priority: DEV_API_KEY env var > .dev-api-key file > auto-generated
const KEY_FILE = path.resolve(__dirname, '.dev-api-key');
let devApiKey = process.env.DEV_API_KEY?.trim() ?? '';

if (!devApiKey) {
  if (fs.existsSync(KEY_FILE)) {
    devApiKey = fs.readFileSync(KEY_FILE, 'utf8').trim();
  } else {
    devApiKey = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(KEY_FILE, devApiKey, { mode: 0o600 });
  }
}

// Printed after Vite's own banner
process.nextTick(() => {
  console.log('');
  console.log('  Dev API key :', devApiKey);
  console.log('  First-visit URL: http://<YOUR_LAN_IP>:5173/?token=' + devApiKey);
  console.log('  (token is stored in a browser cookie after first visit)');
  console.log('');
});

// ─────────────────────────────────────────────────────────────────────────────
export default defineConfig({
  plugins: [solidPlugin(), capacitorStubPlugin(), devNetworkAuthPlugin(devApiKey)],
  build: {
    target: 'esnext',
    rollupOptions: {
      // Capacitor native plugins are resolved at runtime by the Android/iOS layer,
      // not available on npm — externalize so Rollup doesn't fail the web build.
      external: [
        '@capacitor-community/mdns',
        '@capacitor-community/secure-storage-plugin',
        '@capacitor-mlkit/barcode-scanning',
      ],
    },
  },
  server: {
    port: 5173,
    host: true, // bind to 0.0.0.0 so LAN devices can reach it
    proxy: {
      // Forward supervisor API paths to localhost:3464 — avoids CORS in browser mode
      '/gui':      { target: 'http://localhost:3464', changeOrigin: true },
      '/runtime':  { target: 'http://localhost:3464', changeOrigin: true },
      '/chatbot':  { target: 'http://localhost:3464', changeOrigin: true },
      '/ws':       { target: 'ws://localhost:3458',   ws: true },
    },
  },
});
