# E2E Testing Setup

This document explains how to set up and run E2E tests for the Memory Observer Dashboard.

## Prerequisites

### Install Playwright Browsers

Before running E2E tests, you must install Playwright browsers:

```bash
cd dashboard
npx playwright install
```

This downloads Chromium, Firefox, and WebKit browsers needed for testing.

### Start the Development Server

E2E tests require the dashboard to be running:

```bash
# Terminal 1: Start the backend API server
npm run server

# Terminal 2: Start the frontend development server
npm run dev
```

Or use the combined command:
```bash
npm run dev:all
```

## Running Tests

### Run all E2E tests
```bash
npm run test:e2e
```

### Run specific test file
```bash
npx playwright test build-scripts
npx playwright test dashboard
npx playwright test plans
```

### Run tests with UI mode (interactive debugging)
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see the browser)
```bash
npm run test:e2e:headed
```

### View test report
```bash
npm run test:e2e:report
```

## Troubleshooting

### "Executable doesn't exist" Error

If you see this error:
```
Error: browserType.launch: Executable doesn't exist at...
```

Run:
```bash
npx playwright install
```

### Tests Timeout

Make sure both servers are running:
- Backend API on http://localhost:3001
- Frontend on http://localhost:5173

### Network Errors

Check that the MCP data directory exists and has sample data:
```bash
ls data/
```

## Test Structure

- `e2e/fixtures.ts` - Page object models and test fixtures
- `e2e/dashboard.spec.ts` - Core dashboard navigation tests
- `e2e/plans.spec.ts` - Plan management tests
- `e2e/build-scripts.spec.ts` - Build script CRUD workflow tests
- `e2e/agents.spec.ts` - Agent template tests
- `e2e/metrics.spec.ts` - Performance tracking tests
