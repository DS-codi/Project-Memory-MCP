# Extracted Reference Material (20260308T032712Z)

Generated automatically before staging one-time scripts.

## archive/legacy-scripts/2026-03-01/docs/_dsdecoder-build-gui.ps1

Extracted at: 2026-03-08T03:27:12Z

```text
# Build script for ds-viewer-gui and ds-converter-gui
# Usage: .\build-gui.ps1 [-Clean] [-Run] [-Converter] [-Viewer] [-All]
param(
```

## archive/legacy-scripts/2026-03-01/setup-firewall-rule.ps1

Extracted at: 2026-03-08T03:27:12Z

```text
param(
function Test-IsElevated {
.EXAMPLE
```

## archive/legacy-scripts/2026-03-01/run-container.ps1

Extracted at: 2026-03-08T03:27:12Z

```text
param(
function Test-HostGuiBridge {
function Get-HostBridgeIP {
function Convert-WindowsPathToPodmanVmPath {
function Mount-NetworkDriveInWSL {
function Test-PodmanMountablePath {
.EXAMPLE
```

## archive/legacy-scripts/2026-03-01/huh.ps1

Extracted at: 2026-03-08T03:27:12Z

```text
# Capture the time the script starts
```

## archive/legacy-scripts/2026-03-01/start-supervisor-wave-validation.ps1

Extracted at: 2026-03-08T03:27:12Z

```text
#!/usr/bin/env pwsh
#Requires -Version 7
param(
.EXAMPLE
    Reviewer usage path (same shell session):
```

## archive/legacy-scripts/2026-03-01/stop-supervisor.ps1

Extracted at: 2026-03-08T03:27:12Z

```text
#!/usr/bin/env pwsh
#Requires -Version 7
param(
function Write-Section([string]$Text) {
function Write-Ok([string]$Text) {
function Write-Warn([string]$Text) {
function Write-Info([string]$Text) {
function Write-Err([string]$Text) {
function Get-DescendantPids([int]$RootPid) {
function Stop-PidSafely([int]$Pid, [string]$Label) {
.EXAMPLE
```

## archive/legacy-scripts/2026-03-01/run-wave-cohort-validation.ps1

Extracted at: 2026-03-08T03:27:12Z

```text
#!/usr/bin/env pwsh
#Requires -Version 7
param(
function Send-ControlRequest {
.EXAMPLE
```

## archive/legacy-scripts/2026-03-01/build_install.ps1

Extracted at: 2026-03-08T03:27:12Z

```text
#!/usr/bin/env pwsh
param(
function Write-Step([string]$msg) {
function Write-Ok([string]$msg) {
function Write-Fail([string]$msg) {
function Resolve-QtToolchain {
function Invoke-Checked([string]$description, [scriptblock]$block) {
function Invoke-NativeCommandCapture {
    Alias for -InstallOnly (kept for back-compat with build-and-install.ps1 usage).
.EXAMPLE
    throw "Qt/qmake not found. Set `$env:QT_DIR to your Qt kit path (example: C:\Qt\6.10.2\msvc2022_64) or set `$env:QMAKE to qmake6.exe."
```

## archive/legacy-scripts/2026-03-01/launch-supervisor.ps1

Extracted at: 2026-03-08T03:27:12Z

```text
#!/usr/bin/env pwsh
#Requires -Version 7
param(
function Write-Step([string]$Message) {
function Write-Ok([string]$Message) {
function Write-Warn([string]$Message) {
function To-ConfigPathString([string]$PathValue) {
function Resolve-NodeCommandPath {
function Get-RunningComponentProcesses {
    param([string]$WorkspaceRoot)
function New-LaunchConfig {
.EXAMPLE
```

## scripts/folder_cleanup/cleanup_common.py

Extracted at: 2026-03-08T03:27:12Z

```text
class CleanupPaths:
def now_utc() -> datetime:
def iso_utc(value: datetime) -> str:
def relpath_posix(path: Path) -> str:
def cleanup_paths(root: Path) -> CleanupPaths:
def ensure_staging_directories(root: Path) -> CleanupPaths:
def load_json_file(path: Path) -> Dict[str, Any]:
def save_json_file(path: Path, data: Dict[str, Any]) -> None:
def deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
def default_config() -> Dict[str, Any]:
def load_config(config_path: Optional[Path]) -> Dict[str, Any]:
def find_latest_report(root: Path) -> Optional[Path]:
def _ignore_name_set(ignore_paths: Iterable[str]) -> set[str]:
def iter_files(root: Path, ignore_paths: Iterable[str]) -> Iterable[Path]:
def _matches_patterns(text: str, patterns: Iterable[str]) -> bool:
def _score_patterns(text: str, patterns: Iterable[str]) -> int:
            "usage",
            "example",
            "todo",
            "note",
```

