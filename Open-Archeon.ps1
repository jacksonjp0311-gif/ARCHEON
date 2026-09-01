# Desktop-icon entry. Hidden PowerShell, same contract as Open-Helix.ps1:
# bump +dev.N, ensure one backend, compile UI if stale, open through the boot gate.
[CmdletBinding()]
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Get-ArcheonVersion {
    $path = Join-Path $Root 'VERSION'
    if (Test-Path $path) { return (Get-Content $path -Raw).Trim() }
    return '0.0.0'
}

function Update-ArcheonShortcut {
    param([string]$Version, [string]$IconSource, [string]$OpenPath)
    $PowerShellExe = Join-Path $PSHOME 'powershell.exe'
    if (-not (Test-Path $PowerShellExe)) { $PowerShellExe = 'powershell.exe' }
    $desktops = @(
        [Environment]::GetFolderPath('Desktop'),
        (Join-Path $env:USERPROFILE 'OneDrive\Desktop'),
        (Join-Path $env:USERPROFILE 'Desktop')
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
    $shell = New-Object -ComObject WScript.Shell
    foreach ($desk in $desktops) {
        $lnk = Join-Path $desk 'ARCHEON.lnk'
        $sc = $shell.CreateShortcut($lnk)
        $sc.TargetPath = $PowerShellExe
        $sc.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$OpenPath`""
        $sc.WorkingDirectory = $Root
        $sc.WindowStyle = 7
        if ($IconSource) { $sc.IconLocation = "$IconSource,0" }
        $sc.Description = "ARCHEON Spatial Engineering OS v$Version"
        $sc.Save()
        if ($IconSource -and (Test-Path $IconSource)) {
            Copy-Item -Force $IconSource (Join-Path $desk 'ARCHEON.ico')
        }
    }
    $startDir = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\ARCHEON'
    New-Item -ItemType Directory -Force -Path $startDir | Out-Null
    $sm = Join-Path $startDir 'ARCHEON.lnk'
    $sc = $shell.CreateShortcut($sm)
    $sc.TargetPath = $PowerShellExe
    $sc.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$OpenPath`""
    $sc.WorkingDirectory = $Root
    $sc.WindowStyle = 7
    if ($IconSource) { $sc.IconLocation = "$IconSource,0" }
    $sc.Description = "ARCHEON Spatial Engineering OS v$Version"
    $sc.Save()
}

$Version = Get-ArcheonVersion
$bump = Join-Path $Root 'scripts\Bump-Archeon-Dev-Build.ps1'
if (Test-Path $bump) {
    try { $Version = [string](& $bump -Quiet).Trim() } catch { }
}
$Icon = Join-Path $Root 'assets\brand\archeon.ico'
$OpenPath = Join-Path $Root 'Open-Archeon.ps1'
$logDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'last-launch.txt'

try {
    Update-ArcheonShortcut -Version $Version -IconSource $Icon -OpenPath $OpenPath
} catch {
    Add-Content $log "$(Get-Date -Format o) shortcut refresh skipped: $($_.Exception.Message)"
}

function Seed-ArcheonBootSplash {
    $uiDirs = @(
        (Join-Path $env:LOCALAPPDATA 'ARCHEON\ui'),
        (Join-Path $Root 'apps\workstation\dist')
    )
    $bootSrc = Join-Path $Root 'apps\workstation\public\boot.html'
    foreach ($ui in $uiDirs) {
        New-Item -ItemType Directory -Force -Path $ui | Out-Null
        if (Test-Path $bootSrc) { Copy-Item -Force $bootSrc (Join-Path $ui 'boot.html') }
        foreach ($mark in @(
            (Join-Path $Root 'apps\workstation\public\archeon.png'),
            (Join-Path $Root 'assets\brand\archeon.png')
        )) {
            if (Test-Path $mark) { Copy-Item -Force $mark (Join-Path $ui 'archeon.png'); break }
        }
        $status = @{ phase = 'starting'; version = $Version; ok = $null; error = ''; at = (Get-Date).ToString('o') } | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText((Join-Path $ui 'compiler-status.json'), $status)
    }
}

function Start-ArcheonIfPresent {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8799/api/health' -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { return }
    } catch { }
    $exe = @(
        (Join-Path $env:LOCALAPPDATA 'ARCHEON\archeon.exe'),
        (Join-Path $env:LOCALAPPDATA 'ARCHEON\cargo-target\release\archeon.exe'),
        (Join-Path $Root 'target\release\archeon.exe'),
        (Join-Path $Root 'target\debug\archeon.exe')
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $exe) { return }
    $env:ARCHEON_UI_DIR = Join-Path $env:LOCALAPPDATA 'ARCHEON\ui'
    $env:ARCHEON_NO_OPEN = '1'
    $env:ARCHEON_ROOT = $Root
    $env:PYTHONPATH = Join-Path $Root 'workers\cad-occt'
    Start-Process -FilePath $exe -ArgumentList '--no-open' -WorkingDirectory $Root -WindowStyle Hidden
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Milliseconds 200
        try {
            $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8799/api/health' -UseBasicParsing -TimeoutSec 1
            if ($r.StatusCode -eq 200) { return }
        } catch { }
    }
}

Seed-ArcheonBootSplash
Start-ArcheonIfPresent
$boot = "http://127.0.0.1:8799/boot.html?v=$([Uri]::EscapeDataString($Version))&boot=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())&force=1"
Start-Process $boot

$ensure = Join-Path $Root 'scripts\Ensure-Archeon-Backend.ps1'
if (-not (Test-Path $ensure)) { throw "Missing $ensure" }
$ensureLog = Join-Path $logDir 'last-ensure.txt'
$failed = $null
try {
    Start-Transcript -Path $ensureLog -Force | Out-Null
    if ($Force) { & $ensure -WaitSeconds 120 -Force -CompileUi }
    else { & $ensure -WaitSeconds 120 -CompileUi }
} catch {
    $failed = $_
    Add-Content -Path $log -Value "$(Get-Date -Format o) ENSURE FAILED: $($_.Exception.Message)"
    $errUi = Join-Path $env:LOCALAPPDATA 'ARCHEON\ui\compiler-status.json'
    $errBody = @{ phase = 'failed'; version = $Version; ok = $false; error = [string]$failed.Exception.Message; at = (Get-Date).ToString('o') } | ConvertTo-Json -Compress
    Set-Content -Path $errUi -Value $errBody -Encoding UTF8
} finally {
    try { Stop-Transcript | Out-Null } catch { }
}
if ($failed) {
    Set-Content -Path $log -Value "FAILED $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`r`nv$Version`r`n$($failed.Exception.Message)`r`nensure=$ensureLog" -Encoding UTF8
} else {
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Set-Content -Path $log -Value "opened $stamp`r`nv$Version`r`n$boot`r`nensure=$ensureLog" -Encoding UTF8
}
