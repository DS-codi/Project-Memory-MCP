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
