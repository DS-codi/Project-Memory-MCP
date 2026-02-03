# Fix: "Server directory not found" Errors

## Problem
When opening workspaces that don't contain the Project Memory dashboard structure (e.g., `s:\NotionArchive`), the extension logs errors like:

```
[timestamp] Checking paths: ["s:\\NotionArchive\\dashboard\\server",...]
[timestamp] Server directory not found in any location
```

## Root Cause
The extension tries to auto-start the dashboard server on activation by searching for `dashboard/server` in:
1. Current workspace folder
2. Extension installation directory
3. Hardcoded development paths

When none are found, it logged verbose errors that cluttered the output.

## Solution Applied

### Code Changes (v0.2.1)
1. **Reduced log verbosity** - Only logs when server is found, not every path checked
2. **Graceful degradation** - Silently disables server features when unavailable
3. **Hide status bar** - Status bar item hidden in workspaces without server
4. **No error messages** - Changed from error popup to debug log

### For Users

#### Option 1: Do Nothing (Recommended)
The extension now silently handles missing servers. No action needed.

#### Option 2: Disable Auto-Start (Per Workspace)
For workspaces where you never want the server:

**`.vscode/settings.json`:**
```json
{
  "projectMemory.autoStartServer": false
}
```

#### Option 3: Configure External Server
If you want to use a centrally-installed server:

**`.vscode/settings.json`:**
```json
{
  "projectMemory.chat.serverMode": "external",
  "projectMemory.chat.externalServerPath": "c:\\path\\to\\server\\dist\\index.js"
}
```

## Testing
After rebuilding the extension:
1. Open a workspace WITHOUT `dashboard/server` structure
2. Check Output → "Project Memory Server" channel
3. Verify: No verbose path checking or error messages
4. Status bar should be hidden

## Future Improvements
- [ ] Add extension setting: `projectMemory.debug.verboseLogging`
- [ ] Bundle server with extension package
- [ ] Auto-detect if workspace is a Project Memory development workspace
