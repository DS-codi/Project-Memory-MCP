---
plan_id: plan_ml72da5d_09189d1a
created_at: 2026-02-03T20:46:06.152Z
sanitized: false
injection_attempts: 0
warnings: 1
---

# Build System Architecture

## Root Build Script

### File: `build-and-install.ps1`

PowerShell script that orchestrates full project build:

```powershell
# 1. Build Server
cd server/
npm run build

# 2. Build VS Code Extension  
cd vscode-extension/
npm install
npm run compile

# 3. Package Extension
npx @vscode/vsce package

# 4. Install Extension
code --install-extension *.vsix
```

## Module Build Configurations

### Server (MCP Backend)

**Location**: `server/`

**package.json scripts**:
```json
{
  "build": "tsc",                    // TypeScript compilation
  "start": "node dist/index.js",     // Run compiled server
  "dev": "tsc --watch",              // Watch mode for development
  "test": "vitest run",              // Run tests
  "test:watch": "vitest"             // Watch mode for tests
}
```

**Build Output**: `server/dist/` (TypeScript → JavaScript)

**Build Config**: `server/tsconfig.json`
- `"module": "ES2022"`
- `"target": "ES2022"`
- `"moduleResolution": "node"`
- Output to `dist/`

### Dashboard (Frontend)

**Location**: `dashboard/`

**package.json scripts**:
```json
{
  "dev": "vite",                           // Dev server with HMR
  "build": "tsc && vite build",           // Type check + bundle
  "build:webview": "BUILD_TARGET=webview vite build",  // For VS Code
  "preview": "vite preview",               // Preview production build
  "server": "tsx watch server/src/index.ts",  // Dashboard backend
  "dev:all": "concurrently \"npm run dev\" \"npm run server\"",
  "test": "vitest",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test"
}
```

**Build Output**: `dashboard/dist/`

**Build Configs**:
- `vite.config.ts` - Vite bundler configuration
- `tsconfig.json` - TypeScript compiler
- `tailwind.config.js` - Tailwind CSS
- `playwright.config.ts` - E2E tests

### VS Code Extension

**Location**: `vscode-extension/`

**package.json scripts**:
```json
{
  "compile": "node esbuild.js",      // Bundle extension
  "watch": "node esbuild.js --watch",
  "package": "vsce package",          // Create .vsix file
  "test": "vitest"
}
```

**Build Output**: 
- Bundled: `vscode-extension/dist/extension.js`
- Packaged: `*.vsix` file

**Build Config**: `esbuild.js` (custom esbuild configuration)

## Build Workflow

### Development Workflow
```bash
# Terminal 1: Server
cd server
npm run dev

# Terminal 2: Dashboard  
cd dashboard
npm run dev:all

# Terminal 3: Extension (if developing extension)
cd vscode-extension
npm run watch
```

### Production Build
```bash
# Full build and install
pwsh ./build-and-install.ps1

# Or individual modules
cd server && npm run build
cd dashboard && npm run build
cd vscode-extension && npm run compile && npm run package
```

### Testing
```bash
# Server tests
cd server && npm test

# Dashboard tests
cd dashboard && npm test              # Unit tests
cd dashboard && npm run test:e2e     # E2E tests

# Extension tests
cd vscode-extension && npm test
```

## Build Issues & Troubleshooting

### Common Issues:
1. **TypeScript errors**: Run `tsc --noEmit` to check
2. **Missing dependencies**: Run `npm install` in affected module
3. **Port conflicts**: Dashboard dev server uses port 5173 by default
4. **Extension not loading**: Check VS Code Developer Tools console

### Builder Agent Use Cases:
- Verify all modules build successfully
- Run builds in correct order (server → dashboard → extension)
- Detect and fix TypeScript errors
- Install missing dependencies
- Package extension for deployment
- Run test suites
- Clean and rebuild when needed

## Build Scripts Storage Schema

Based on requirements, build scripts should store:

```typescript
interface BuildScript {
  id: string;                    // Unique identifier
  name: string;                  // e.g., "Build Server"
  description: string;           // e.g., "Compile TypeScript server"
  created_at: string;            // ISO timestamp
  required_directory: string;    // e.g., "server" (relative to workspace)
  command: string;               // e.g., "npm run build"
  mcp_handle?: string;          // Optional: "build_server" for MCP exposure
  environment?: Record<string, string>;  // Optional env vars
  timeout_seconds?: number;     // Optional timeout
  expected_outputs?: string[];  // Optional: files/dirs that should exist after
}
```

### Example Scripts for Project Memory MCP:

```json
[
  {
    "id": "script_ml72f3gh_abc123",
    "name": "Build Server",
    "description": "Compile TypeScript server to JavaScript",
    "created_at": "2026-02-03T20:00:00Z",
    "required_directory": "server",
    "command": "npm run build",
    "mcp_handle": "build_server",
    "expected_outputs": ["server/dist/index.js"]
  },
  {
    "id": "script_ml72f3gh_def456",
    "name": "Build Dashboard",
    "description": "Build React dashboard with Vite",
    "required_directory": "dashboard",
    "command": "npm run build",
    "expected_outputs": ["dashboard/dist/index.html"]
  },
  {
    "id": "script_ml72f3gh_ghi789",
    "name": "Build and Install Extension",
    "description": "Full build and install VS Code extension",
    "required_directory": ".",
    "command": "pwsh ./build-and-install.ps1"
  },
  {
    "id": "script_ml72f3gh_jkl012",
    "name": "Run Server Tests",
    "description": "Run vitest test suite for server",
    "required_directory": "server",
    "command": "npm test"
  }
]
```

## Integration with Builder Agent

The Builder agent should:
1. **Access build scripts** via MCP tool (e.g., `memory_plan` with `list_build_scripts` action)
2. **Execute scripts** using terminal/execution tools
3. **Monitor output** for errors
4. **Parse build failures** and suggest fixes
5. **Verify expected outputs** exist after build
6. **Run in correct directory** (cd to `required_directory`)
7. **Retry with clean state** if build fails (e.g., `npm clean-install`)
