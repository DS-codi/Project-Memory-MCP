#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$RunId,
    [string]$HealthContractPath = "docs/integration-harness/contracts/health-readiness.contract.json",
    [string]$HandshakeUrl = "http://localhost:3000/health",
    [int]$HandshakeTimeoutMs = 3000,
    [string]$TestFile = "src/test/suite/integration/headless-activation-handshake.test.ts",
    [switch]$ValidateOnly,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-PathFromRoot {
    param(
        [Parameter(Mandatory)] [string]$Root,
        [Parameter(Mandatory)] [string]$PathValue
    )

    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return $PathValue
    }

    return Join-Path $Root $PathValue
}

function Ensure-ParentDirectory {
    param([Parameter(Mandatory)] [string]$Path)

    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        $null = New-Item -ItemType Directory -Path $parent -Force
    }
}

$root = Split-Path -Parent $PSScriptRoot
$contractResolved = Resolve-PathFromRoot -Root $root -PathValue $HealthContractPath
$extensionRoot = Join-Path $root "vscode-extension"
$testFileResolved = Resolve-PathFromRoot -Root $extensionRoot -PathValue $TestFile
$assertionsPath = Join-Path $root ".tmp/integration-harness/runs/$RunId/artifacts/assertions/extension-headless-assertions.json"

if (-not (Test-Path $contractResolved)) {
    throw "health contract not found: $contractResolved"
}

if (-not (Test-Path $extensionRoot)) {
    throw "vscode extension root not found: $extensionRoot"
}

if (-not (Test-Path $testFileResolved)) {
    throw "headless extension test file not found: $testFileResolved"
}

if ($ValidateOnly) {
    Write-Host "OK: extension headless lane validation passed. test_file=$testFileResolved contract=$contractResolved"
    exit 0
}

if (-not $DryRun) {
    & (Join-Path $PSScriptRoot "integration-harness-readiness.ps1") -ContractPath $contractResolved
    if ($LASTEXITCODE -ne 0) {
        throw "Readiness gate failed before extension headless lane."
    }
}

$env:PROJECT_MEMORY_TEST_MODE = "1"
$env:PM_INTEGRATION_RUN_ID = $RunId
$env:PM_EXTENSION_HANDSHAKE_URL = $HandshakeUrl
$env:PM_EXTENSION_HANDSHAKE_TIMEOUT_MS = [string]$HandshakeTimeoutMs
$env:PM_EXTENSION_ASSERTIONS_PATH = $assertionsPath
$env:PM_EXTENSION_HEADLESS_DRY_RUN = if ($DryRun) { "1" } else { "0" }

if ($DryRun) {
    Ensure-ParentDirectory -Path $assertionsPath
    $payload = [ordered]@{
        run_id = $RunId
        lane = "extension-headless"
        status = "pass"
        dry_run = $true
        extension_activation = "synthetic_pass"
        backend_handshake = "synthetic_pass"
        handshake_url = $HandshakeUrl
        generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    }
    $payload | ConvertTo-Json -Depth 8 | Set-Content -Path $assertionsPath
    Write-Host "OK: extension headless dry-run completed. assertions_path=$assertionsPath"
    exit 0
}

Push-Location $extensionRoot
try {
    & npm run test -- $TestFile
    if ($LASTEXITCODE -ne 0) {
        throw "Extension headless lane test failed (exit $LASTEXITCODE)."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path $assertionsPath)) {
    throw "Expected extension headless assertions output not found: $assertionsPath"
}

Write-Host "OK: extension headless lane passed. assertions_path=$assertionsPath"
exit 0
