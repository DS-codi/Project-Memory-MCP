# Memory Observer Dashboard

A web-based dashboard for monitoring the Project Memory MCP Server. View agent workflows, track plan progress, and manage agent deployments across all registered workspaces.

## Features

- **Real-time Monitoring**: Watch agent handoffs and plan updates live
- **Workspace Overview**: View all registered workspaces with health indicators
- **Plan Management**: Browse, filter, and inspect plans with detailed timelines
- **Agent Tracking**: Visualize handoff sequences and current agent sessions
- **Agent Inventory**: Manage agent instruction file deployments

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or pnpm

### Installation

```bash
# From the dashboard directory
cd dashboard

# Install frontend dependencies
npm install

# Install server dependencies
cd server
npm install
cd ..
```

### Configuration

Set the environment variables to point to your MCP data:

```bash
# Windows PowerShell
$env:MBS_DATA_ROOT = "C:\path\to\Project-Memory-MCP\data"
$env:MBS_AGENTS_ROOT = "C:\path\to\Project-Memory-MCP\agents"

# Or create a .env file in the server directory
```

### Running

**Development mode (both frontend and API):**

```bash
npm run dev:all
```

**Or run separately:**

```bash
# Terminal 1: API Server
npm run server

# Terminal 2: Frontend
npm run dev
```

The dashboard will be available at: **http://localhost:5173**
The API server runs at: **http://localhost:3001**

## Project Structure

```
dashboard/
├── src/                    # React frontend
│   ├── components/         # UI components
│   │   ├── layout/         # App shell (Sidebar, Header)
│   │   ├── workspace/      # Workspace cards and lists
│   │   ├── plan/           # Plan cards, lists, steps
│   │   ├── timeline/       # Handoff visualization
│   │   ├── agents/         # Agent management UI
│   │   └── common/         # Shared components
│   ├── pages/              # Route pages
│   ├── hooks/              # React Query hooks
│   ├── store/              # Zustand state
│   ├── types/              # TypeScript types
│   └── utils/              # Helpers and formatters
└── server/                 # Express API server
    └── src/
        ├── routes/         # API endpoints
        └── services/       # File scanning and watching
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces` | List all workspaces |
| GET | `/api/workspaces/:id` | Get workspace details |
| GET | `/api/plans/workspace/:id` | List plans for workspace |
| GET | `/api/plans/:wsId/:planId` | Get full plan state |
| GET | `/api/agents` | List agent templates |

## Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **State**: TanStack Query, Zustand
- **Backend**: Express, Chokidar (file watcher)
- **Real-time**: WebSocket

## Screenshots

*Coming soon*

## License

MIT
