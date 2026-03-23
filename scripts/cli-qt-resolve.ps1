# PS 5.1-compatible Qt bin resolver.
# Dot-source this file to get Find-QtBin.
#
#   . "$PSScriptRoot\cli-qt-resolve.ps1"
#   $QtBin = Find-QtBin

function Find-QtBin {
    $candidates = New-Object System.Collections.ArrayList

    # Highest priority: QMAKE env var pointing directly at qmake6.exe / qmake.exe
    if ($env:QMAKE -and (Test-Path $env:QMAKE)) {
        $null = $candidates.Add((Split-Path -Parent $env:QMAKE))
    }

    # Qt dir env vars (may point to kit root or bin)
    foreach ($envVar in @('QT_DIR', 'QTDIR', 'Qt6_DIR')) {
        $val = [System.Environment]::GetEnvironmentVariable($envVar)
        if ($val) {
            $null = $candidates.Add($val)
            $null = $candidates.Add((Join-Path $val 'bin'))
        }
    }

    # Common Windows install roots
    foreach ($qtRoot in @('C:\Qt', 'D:\Qt', 'E:\Qt')) {
        if (-not (Test-Path $qtRoot)) { continue }
        $versions = Get-ChildItem $qtRoot -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^\d+\.\d+' } |
            Sort-Object Name -Descending |
            Select-Object -First 4
        foreach ($ver in $versions) {
            $kits = Get-ChildItem $ver.FullName -Directory -Filter 'msvc*_64' -ErrorAction SilentlyContinue
            foreach ($kit in $kits) {
                $null = $candidates.Add((Join-Path $kit.FullName 'bin'))
            }
        }
    }

    # Last-resort fallback
    $null = $candidates.Add('C:\Qt\6.10.2\msvc2022_64\bin')

    $unique = $candidates | Select-Object -Unique
    foreach ($dir in $unique) {
        if (-not $dir) { continue }
        if (Test-Path (Join-Path $dir 'qmllint.exe')) { return $dir }
    }
    return $null
}

function Find-QmakePath {
    param([string]$QtBin)
    $q6 = Join-Path $QtBin 'qmake6.exe'
    if (Test-Path $q6) { return $q6 }
    $q  = Join-Path $QtBin 'qmake.exe'
    if (Test-Path $q)  { return $q }
    return $null
}

function Find-WindowsSdkX64Bin {
    $kitsBase = 'C:\Program Files (x86)\Windows Kits\10\bin'
    if (-not (Test-Path $kitsBase)) { return $null }

    $sdkVersions = Get-ChildItem $kitsBase -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
        Sort-Object { [Version]$_.Name } -Descending

    foreach ($ver in $sdkVersions) {
        $x64Dir = Join-Path $ver.FullName 'x64'
        if (Test-Path (Join-Path $x64Dir 'dxcompiler.dll')) {
            return $x64Dir
        }
    }

    return $null
}

function Initialize-WinDeployQtEnvironment {
    param(
        [string]$QtBin
    )

    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (-not $env:VCINSTALLDIR -and (Test-Path $vswhere)) {
        $vsInstallPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($vsInstallPath)) {
            $vcInstallDir = Join-Path $vsInstallPath 'VC'
            if (Test-Path $vcInstallDir) {
                if (-not $vcInstallDir.EndsWith('\')) { $vcInstallDir += '\' }
                $env:VCINSTALLDIR = $vcInstallDir
            }
        }
    }

    if (-not $env:WindowsSdkDir) {
        $sdkRoot = 'C:\Program Files (x86)\Windows Kits\10'
        if (Test-Path $sdkRoot) {
            $env:WindowsSdkDir = "$sdkRoot\"
        }
    }

    if (-not $env:WindowsSDKVersion) {
        $kitsBase = 'C:\Program Files (x86)\Windows Kits\10\bin'
        if (Test-Path $kitsBase) {
            $latestSdk = Get-ChildItem $kitsBase -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
                Sort-Object { [Version]$_.Name } -Descending |
                Select-Object -First 1
            if ($latestSdk) {
                $env:WindowsSDKVersion = "$($latestSdk.Name)\"
            }
        }
    }

    $sdkX64 = Find-WindowsSdkX64Bin
    if ($sdkX64 -and ($env:PATH -notlike "$sdkX64*")) {
        $env:PATH = "$sdkX64;$env:PATH"
    }

    if ($QtBin -and (Test-Path $QtBin) -and ($env:PATH -notlike "$QtBin*")) {
        $env:PATH = "$QtBin;$env:PATH"
    }
}
