param(
    [ValidateRange(1, 200)]
    [int]$Runs = 20
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $PSScriptRoot "supervisor-lock-race-sweep-$timestamp.log"
$testArg = 'Supervisor=concurrent_race_exactly_one_acquires -- --nocapture'

Set-Content -Path $logPath -Value "command=.\\run-tests.ps1 -Component Supervisor -KeepRustTestBinaries -TailLines 8 -TestArg '$testArg'"

for ($i = 1; $i -le $Runs; $i++) {
    Write-Host "=== Sweep Run $i/$Runs ==="

    pwsh -NoProfile -File .\run-tests.ps1 -Component Supervisor -KeepRustTestBinaries -TailLines 8 -TestArg $testArg
    $exitCode = $LASTEXITCODE

    Add-Content -Path $logPath -Value ("run={0} exit={1}" -f $i, $exitCode)

    if ($exitCode -ne 0) {
        Write-Host "SWEEP_FAIL run=$i log=$logPath"
        exit $exitCode
    }
}

Write-Host "SWEEP_PASS log=$logPath"
