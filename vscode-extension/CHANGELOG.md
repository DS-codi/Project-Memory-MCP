# Changelog

All notable changes to the Project Memory Dashboard extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2025-01-XX

### Added
- **Embedded Server Management**
  - Extension now automatically starts and manages the dashboard server
  - No need to manually run `npm run dev:all` in a separate terminal
  - Server lifecycle managed by extension activation/deactivation
  - New `ServerManager` class for robust server process handling
  - Auto-restart on server crash (up to 3 attempts)
  - Health check to verify server readiness

- **Server Commands**
  - `projectMemory.toggleServer` - Toggle server on/off
  - `projectMemory.startServer` - Start the dashboard server
  - `projectMemory.stopServer` - Stop the dashboard server
  - `projectMemory.restartServer` - Restart the server
  - `projectMemory.showServerLogs` - View server output logs

- **New Settings**
  - `projectMemory.autoStartServer` - Auto-start server on activation (default: true)
  - `projectMemory.serverPort` - API server port (default: 3001)
  - `projectMemory.wsPort` - WebSocket server port (default: 3002)

- **VS Code Copilot Integration**
  - Deploy agent instruction files to `.github/agents/`
  - Deploy prompt templates to `.github/prompts/`
  - Deploy instruction files to `.github/instructions/`
  - New `CopilotFileWatcher` for monitoring template changes
  
- **New Commands**
  - `projectMemory.deployPrompts` - Deploy prompt templates
  - `projectMemory.deployInstructions` - Deploy instruction files
  - `projectMemory.deployCopilotConfig` - Deploy all Copilot configuration
  - `projectMemory.openAgentFile` - Open agent file for editing
  - `projectMemory.openPromptFile` - Open prompt file for editing
  - `projectMemory.showCopilotStatus` - View deployment status

- **New Settings**
  - `projectMemory.promptsRoot` - Path to prompt templates
  - `projectMemory.instructionsRoot` - Path to instruction files

- **Status Bar Enhancements**
  - Server status indicator with toggle command
  - Temporary status messages
  - Copilot status indicator

### Changed
- Updated README with Copilot integration documentation
- Enhanced StatusBarManager with new display methods

## [0.1.0] - 2025-01-XX

### Added
- Initial release
- Dashboard webview with workspace overview
- Agent management and deployment
- Plan tracking with step visualization
- Live updates via WebSocket
- Status bar with activity indicator
- File watchers for agent templates
- Integration with Project Memory MCP server

### Commands
- `projectMemory.showDashboard` - Open dashboard sidebar
- `projectMemory.createPlan` - Create new plan
- `projectMemory.deployAgents` - Deploy agent templates
- `projectMemory.refreshDashboard` - Refresh data

### Settings
- `projectMemory.dataRoot` - Data directory path
- `projectMemory.agentsRoot` - Agent templates path
- `projectMemory.autoRefresh` - Enable auto-refresh
- `projectMemory.autoDeployAgents` - Auto-deploy on save
- `projectMemory.apiPort` - API server port

[Unreleased]: https://github.com/your-org/project-memory-mcp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/your-org/project-memory-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/your-org/project-memory-mcp/releases/tag/v0.1.0
