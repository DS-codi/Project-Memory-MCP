import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { workspacesRouter } from './routes/workspaces.js';
import { plansRouter } from './routes/plans.js';
import { agentsRouter } from './routes/agents.js';
import { eventsRouter } from './routes/events.js';
import { searchRouter } from './routes/search.js';
import { reportsRouter } from './routes/reports.js';
import { metricsRouter } from './routes/metrics.js';
import { promptsRouter } from './routes/prompts.js';
import { instructionsRouter } from './routes/instructions.js';
import { deployRouter } from './routes/deploy.js';
import { knowledgeRouter } from './routes/knowledge.js';
import { programsRouter } from './routes/programs.js';
import { getDataRoot } from './storage/workspace-utils.js';
import { eventBus } from './events/eventBus.js';
import { getDb } from './db/connection.js';
import * as fs from 'fs';
import * as fsAsync from 'fs/promises';

const PORT = process.env.PORT || 3001;

// Get data root from environment or use canonical default
const MBS_DATA_ROOT = getDataRoot();
const workspaceRoot = path.resolve(MBS_DATA_ROOT, '..');
const MBS_AGENTS_ROOT = process.env.MBS_AGENTS_ROOT || path.resolve(workspaceRoot, 'agents');
const MBS_PROMPTS_ROOT = process.env.MBS_PROMPTS_ROOT || path.resolve(workspaceRoot, 'prompts');
const MBS_INSTRUCTIONS_ROOT = process.env.MBS_INSTRUCTIONS_ROOT || path.resolve(workspaceRoot, 'instructions');

// Make paths available globally
declare global {
  var MBS_DATA_ROOT: string;
  var MBS_AGENTS_ROOT: string;
  var MBS_PROMPTS_ROOT: string;
  var MBS_INSTRUCTIONS_ROOT: string;
}
globalThis.MBS_DATA_ROOT = MBS_DATA_ROOT;
globalThis.MBS_AGENTS_ROOT = MBS_AGENTS_ROOT;
globalThis.MBS_PROMPTS_ROOT = MBS_PROMPTS_ROOT;
globalThis.MBS_INSTRUCTIONS_ROOT = MBS_INSTRUCTIONS_ROOT;

// Track server start time and last error for health reporting
const serverStartTime = Date.now();
let lastErrorTimestamp: string | null = null;

// Global error tracking
process.on('uncaughtException', (err) => {
  lastErrorTimestamp = new Date().toISOString();
  console.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  lastErrorTimestamp = new Date().toISOString();
  console.error('Unhandled rejection:', reason);
});

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/workspaces', workspacesRouter);
app.use('/api/plans', plansRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/search', searchRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/prompts', promptsRouter);
app.use('/api/instructions', instructionsRouter);
app.use('/api/deploy', deployRouter);
app.use('/api/programs', programsRouter);
app.use('/api/workspaces/:id/knowledge', knowledgeRouter);

// Health check — enhanced with uptime, WebSocket clients, memory, last error
app.get('/api/health', (req, res) => {
  const memUsage = process.memoryUsage();
  res.json({ 
    status: 'ok',
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    memory: {
      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
      rssMB: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
    },
    lastError: lastErrorTimestamp,
    dataRoot: MBS_DATA_ROOT,
    agentsRoot: MBS_AGENTS_ROOT,
    promptsRoot: MBS_PROMPTS_ROOT,
    instructionsRoot: MBS_INSTRUCTIONS_ROOT,
    timestamp: new Date().toISOString() 
  });
});

type FrontendBuild = {
  distDir: string;
  indexHtml: string;
};

const frontendBuildCandidates = [
  path.resolve(__dirname, '../../dist'),
  path.resolve(__dirname, '../../dist-webview'),
];

function resolveFrontendBuild(): FrontendBuild | null {
  for (const distDir of frontendBuildCandidates) {
    const indexHtml = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtml)) {
      return { distDir, indexHtml };
    }
  }

  return null;
}

const initialFrontendBuild = resolveFrontendBuild();

if (initialFrontendBuild) {
  app.use(express.static(initialFrontendBuild.distDir));
  console.log(`📦 Serving static frontend from ${initialFrontendBuild.distDir}`);
} else {
  console.warn('⚠️ No dashboard frontend build found (checked dist and dist-webview).');
}

// Dashboard error logging endpoint (async I/O)
app.post('/api/errors', async (req, res) => {
  try {
    const { error, componentStack, url, timestamp: clientTimestamp } = req.body;
    const logsDir = path.join(MBS_DATA_ROOT, 'logs');
    await fsAsync.mkdir(logsDir, { recursive: true });
    const logPath = path.join(logsDir, 'dashboard-errors.log');

    const entry = JSON.stringify({
      timestamp: clientTimestamp || new Date().toISOString(),
      error: error || 'Unknown error',
      componentStack: componentStack || null,
      url: url || null,
    });

    await fsAsync.appendFile(logPath, entry + '\n');
    lastErrorTimestamp = new Date().toISOString();
    res.json({ logged: true });
  } catch (e) {
    console.error('Failed to log dashboard error:', e);
    res.status(500).json({ logged: false });
  }
});

// SPA fallback — serve index.html for non-API routes (client-side routing)
app.get('*', (_req, res) => {
  const frontendBuild = resolveFrontendBuild();

  if (frontendBuild) {
    res.sendFile(frontendBuild.indexHtml);
    return;
  }

  res.status(503).send(
    'Dashboard frontend is not built yet. Run `npm run build` in the dashboard directory, then refresh.'
  );
});

// Start HTTP server
const httpServer = createServer(app);
httpServer.listen(PORT, () => {
  console.log(`🧠 Memory Observer API running at http://localhost:${PORT}`);
  console.log(`   Data root: ${MBS_DATA_ROOT}`);
  console.log(`   Agents root: ${MBS_AGENTS_ROOT}`);
  console.log(`   Prompts root: ${MBS_PROMPTS_ROOT}`);
  console.log(`   Instructions root: ${MBS_INSTRUCTIONS_ROOT}`);

  // Open DB connection eagerly so first request is fast
  try {
    getDb();
  } catch (err) {
    console.warn('[db] Could not open project-memory.db on startup (will retry on first request):', err);
  }

  // Connect to supervisor SSE if configured
  const supervisorUrl = process.env.SUPERVISOR_EVENTS_URL;
  if (supervisorUrl) {
    console.log(`[eventBus] Connecting to supervisor SSE: ${supervisorUrl}`);
    eventBus.connectToSupervisor(supervisorUrl);
  } else {
    console.log('[eventBus] SUPERVISOR_EVENTS_URL not set — supervisor SSE disabled');
  }
});
