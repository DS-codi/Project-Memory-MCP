# Memory Observer Dashboard

The dashboard is the web UI for Project Memory MCP observability and operations. It combines a React frontend with an Express API backend to display workspaces, plans, agents, diagnostics, and deployment actions.

## What It Includes

- React + TypeScript frontend (`dashboard/src`)
- Express + TypeScript API server (`dashboard/server/src`)
- Live event stream integration for plan/step/workspace updates
- Operational views for plans, programs, diagnostics, deploy flows, and reports

## Prerequisites

- Node.js 18+
- npm

## Install

```bash
cd dashboard
npm install
cd server
npm install
cd ..
```

## Development

Run frontend + API together:

```bash
npm run dev:all
```

Run separately:

```bash
# Frontend
npm run dev

# API server
npm run server
```

Default endpoints:

- Frontend: `http://localhost:5173`
- API: `http://localhost:3001`

## Build

```bash
# Frontend production build
npm run build

# Webview-target build (for VS Code extension embedding)
npm run build:webview
```

Backend-only build:

```bash
cd server
npm run build
```

## Testing

```bash
# Unit/integration tests (watch)
npm run test

# Unit/integration tests (single run)
npm run test:run

# Coverage
npm run test:coverage

# E2E
npm run test:e2e
```

## Environment

The API server resolves roots from the Project Memory workspace context. You can override with environment variables:

- `MBS_DATA_ROOT`
- `MBS_AGENTS_ROOT`
- `MBS_PROMPTS_ROOT`
- `MBS_INSTRUCTIONS_ROOT`
- `PORT` (defaults to `3001`)
- `SUPERVISOR_EVENTS_URL` (optional SSE source)

## API Surface

Mounted API routes:

- `/api/workspaces`
- `/api/plans`
- `/api/agents`
- `/api/events`
- `/api/search`
- `/api/reports`
- `/api/metrics`
- `/api/prompts`
- `/api/instructions`
- `/api/deploy`
- `/api/programs`
- `/api/workspaces/:id/knowledge`
- `/api/health`
- `/api/errors`

## Frontend Build Serving

The server serves static frontend assets from:

1. `dashboard/dist`
2. `dashboard/dist-webview`

If neither exists, non-API routes return a build reminder.

## Notes

- This dashboard is the canonical operational UI used by the VS Code extension’s webview.
- Keep route and command docs aligned with `dashboard/server/src/index.ts` and `dashboard/package.json`.