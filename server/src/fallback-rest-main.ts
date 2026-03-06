import { createServer } from 'node:http';
import { createFallbackRestApp } from './transport/fallback-rest.js';

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

const app = createFallbackRestApp();
const host = process.env.FALLBACK_API_HOST || '127.0.0.1';
const port = parsePort(process.env.FALLBACK_API_PORT, 3013);

const server = createServer(app);

server.listen(port, host, () => {
  // Keep output concise for supervisor logs.
  console.log(`[fallback-rest] listening on http://${host}:${port}`);
});

server.on('error', (error) => {
  console.error('[fallback-rest] failed to start', error);
  process.exitCode = 1;
});
