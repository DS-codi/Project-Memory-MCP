# Project Memory MCP Install Wizard

The `install-wizard.ps1` script provides a guided, interactive installation experience for Project Memory MCP on Windows.

## What it does

1.  **Guided Configuration:** Prompts for installation and data directories.
2.  **Component Selection:** Allows you to choose which parts of the system to install.
3.  **Source Build:** Builds the latest version of all selected components from source.
4.  **Deployment:** Copies executables, runtime dependencies (Qt, DLLs), and library files (Server, Dashboard) to permanent user directories (e.g., `%LOCALAPPDATA%\ProjectMemory`).
5.  **Environment Setup:** Automatically sets `PM_DATA_ROOT` and adds the `bin` folder to your user `PATH`.
6.  **Extension Integration:** Offers to install the VS Code extension directly.

## Usage

Run the script from the root of the repository:

```powershell
.\install-wizard.ps1
```

### Parameters

- `-NonInteractive`: Runs with all defaults (useful for automated setups).
- `-InstallPath <path>`: Specifies the installation root (e.g., `C:\Apps\ProjectMemory`).
- `-DataPath <path>`: Specifies the data root (PM_DATA_ROOT).

## Post-Installation

After the wizard completes:

1.  **Restart your terminal** (or VS Code) to refresh environment variables.
2.  Type `supervisor` from any terminal to launch the tray application.
3.  The system is now "installed" and can be run even if the repository is moved or deleted (though it's recommended to keep the repo for updates).

## Updating

To update your installation, simply pull the latest changes in the repository and run the wizard again.
