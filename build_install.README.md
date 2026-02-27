# build_install.ps1

`build_install.ps1` is the two-phase build/install script for Project Memory MCP.

It builds the selected components first, then optionally runs install/post-build actions.

## Key behavior

- Build phase always runs first for selected components.
- Install phase runs **after** all builds complete.
- If `-AutoInstall` is not set, the script prompts:
  - `Install components now (y/N) ?`
- If `-SkipInstall` is set, install phase is skipped.

## Usage

```powershell
# Build default component set (same as -Component All), then prompt for install
.\build_install.ps1

# Build only selected components, then prompt
.\build_install.ps1 -Component Server,Extension

# Build then auto-install without prompt
.\build_install.ps1 -Component Server,Extension -AutoInstall

# Build only (no install phase)
.\build_install.ps1 -Component Server -SkipInstall

# Build/install with transcript logging to file
.\build_install.ps1 -Component Dashboard -LogFile .\logs\build_install.log
```

## Parameters

### `-Component <string[]>`
Selected components to process.

Valid values:
- `Server`
- `Extension`
- `Container`
- `Supervisor`
- `InteractiveTerminal`
- `Dashboard`
- `GuiForms`
- `All`

If `All` is included, the script uses the default build list:
- `Supervisor`, `GuiForms`, `InteractiveTerminal`, `Server`, `Dashboard`, `Extension`

### `-AutoInstall`
Skips the install confirmation prompt and runs install/post-build actions immediately after build phase.

### `-SkipInstall`
Skips install/post-build actions after building.

### `-LogFile <path>`
Writes full script output to a transcript log file (directories are created automatically).

### `-Force`
Passes force behavior to component-specific install actions (for example, `code --install-extension --force`) and no-cache behavior for container build.

### `-InstallOnly` / `-NoBuild`
Retained for backward compatibility with extension packaging behavior.

### `-NewDatabase`
For server install phase: archives existing DB and creates/initializes a fresh one during seed.

### `-GeminiEnvFile <path>`
Optional path to Gemini env file used when launching Supervisor runtime.

## Install-phase actions by component

- `Server`: runs DB seed/init logic (and optional `-NewDatabase` archive flow).
- `Extension`: installs latest generated `.vsix` unless install is skipped.
- `Supervisor`: launches built Supervisor executable (with optional Gemini env injection).

Other components are build-only in this script’s deferred install model.

## Notes

- Run from project root: `Project-Memory-MCP`.
- Relative paths (for `-LogFile` and `-GeminiEnvFile`) are resolved from script root.
- If install is prompted and you press Enter, default is **No**.
