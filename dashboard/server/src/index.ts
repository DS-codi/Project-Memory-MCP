import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
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
import { setupFileWatcher } from './services/fileWatcher.js';

const PORT = process.env.PORT || 3001;
const WS_PORT = process.env.WS_PORT || 3002;

// Get data root from environment or use default
const MBS_DATA_ROOT = process.env.MBS_DATA_ROOT || 
  'c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\data';
const MBS_AGENTS_ROOT = process.env.MBS_AGENTS_ROOT || 
  'c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\agents';
const MBS_PROMPTS_ROOT = process.env.MBS_PROMPTS_ROOT || 
  'c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\prompts';
const MBS_INSTRUCTIONS_ROOT = process.env.MBS_INSTRUCTIONS_ROOT || 
  'c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\instructions';

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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    dataRoot: MBS_DATA_ROOT,
    agentsRoot: MBS_AGENTS_ROOT,
    promptsRoot: MBS_PROMPTS_ROOT,
    instructionsRoot: MBS_INSTRUCTIONS_ROOT,
    timestamp: new Date().toISOString() 
  });
});

// Start HTTP server
const httpServer = createServer(app);
httpServer.listen(PORT, () => {
  console.log(`🧠 Memory Observer API running at http://localhost:${PORT}`);
  console.log(`   Data root: ${MBS_DATA_ROOT}`);
  console.log(`   Agents root: ${MBS_AGENTS_ROOT}`);
  console.log(`   Prompts root: ${MBS_PROMPTS_ROOT}`);
  console.log(`   Instructions root: ${MBS_INSTRUCTIONS_ROOT}`);
});

// Start WebSocket server
const wss = new WebSocketServer({ port: Number(WS_PORT) });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Setup file watcher for live updates
setupFileWatcher(MBS_DATA_ROOT, (event) => {
  const message = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
});

console.log(`📡 WebSocket server running at ws://localhost:${WS_PORT}`);
