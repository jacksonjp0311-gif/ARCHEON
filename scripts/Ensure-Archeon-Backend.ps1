# Ensure one ARCHEON backend is up.
# Safe to call from the desktop icon — does NOT kill a healthy matching server.
# Does NOT open a browser.
#
#   .\scripts\Ensure-Archeon-Backend.ps1

[CmdletBinding()]
param(
    [int]$WaitSeconds = 60,
    [switch]$Force,
    [switch]$CompileUi
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$TargetDir = Join-Path $env:LOCALAPPDATA 'ARCHEON\cargo-target'
$InstallDir = Join-Path $env:LOCALAPPDATA 'ARCHEON'
$InstallUi = Join-Path $InstallDir 'ui'
$LocalHealth = 'http://127.0.0.1:8799/api/health'
$LocalVersion = 'http://127.0.0.1:8799/api/version'
$env:CARGO_TARGET_DIR = $TargetDir

function Add-ArcheonToolPath {
    $add = @(
        (Join-Path $env:USERPROFILE '.cargo\bin'),
        'C:\Program Files\nodejs',
        'C:\Program Files (x86)\nodejs',
        (Join-Path $env:APPDATA 'npm')
    )
    $kits = 'C:\Program Files (x86)\Windows Kits\10\bin'
    if (Test-Path $kits) {
        $rc = Get-ChildItem -Path $kits -Recurse -Filter rc.exe -ErrorAction SilentlyContinue |
            Where-Object { $_.DirectoryName -match '\\x64$' } |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($rc) { $add += $rc.DirectoryName }
    }
    foreach ($p in $add) {
        if ($p -and (Test-Path $p)) { $env:PATH = "$p;$env:PATH" }
    }
}

function Test-ArcheonServer {
    try {
        $r = Invoke-WebRequest -Uri $LocalHealth -UseBasicParsing -TimeoutSec 2
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

function Get-ArcheonSourceVersion {
    $path = Join-Path $Root 'VERSION'
    if (-not (Test-Path $path)) { return '' }
    return (Get-Content $path -Raw).Trim()
}

function Get-RunningArcheonVersion {
    foreach ($uri in @($LocalHealth, $LocalVersion)) {
        try {
            $prev = $ErrorActionPreference
            $ErrorActionPreference = 'SilentlyContinue'
            $body = Invoke-RestMethod $uri -TimeoutSec 2
            $ErrorActionPreference = $prev
            if ($body.version) { return [string]$body.version }
        } catch {
            $ErrorActionPreference = 'Stop'
        }
    }
    return ''
}

function Get-ArcheonExe {
    $release = Join-Path $TargetDir 'release\archeon.exe'
    $legacy = Join-Path $Root 'target\release\archeon.exe'
    $debug = Join-Path $Root 'target\debug\archeon.exe'
    $installed = Join-Path $InstallDir 'archeon.exe'
    foreach ($c in @($release, $legacy, $installed, $debug)) {
        if (Test-Path $c) { return (Get-Item $c).FullName }
    }
    return $null
}

function Test-ArcheonSourceNewerThanBinary([string]$ExePath) {
    if (-not $ExePath -or -not (Test-Path -LiteralPath $ExePath)) { return $true }
    $builtAt = (Get-Item -LiteralPath $ExePath).LastWriteTimeUtc
    $roots = @(
        (Join-Path $Root 'VERSION'),
        (Join-Path $Root 'Cargo.toml'),
        (Join-Path $Root 'Cargo.lock'),
        (Join-Path $Root 'crates'),
        (Join-Path $Root 'projects')
    )
    foreach ($path in $roots) {
        if (-not (Test-Path $path)) { continue }
        $items = if ((Get-Item -LiteralPath $path).PSIsContainer) {
            Get-ChildItem -LiteralPath $path -Recurse -File -ErrorAction SilentlyContinue |
                Where-Object { $_.Extension -in @('.rs', '.toml', '.json') }
        } else { @(Get-Item -LiteralPath $path) }
        if ($items | Where-Object { $_.LastWriteTimeUtc -gt $builtAt } | Select-Object -First 1) { return $true }
    }
    return $false
}

function Test-ArcheonUiStale {
    $index = Join-Path $Root 'apps\workstation\dist\index.html'
    if (-not (Test-Path $index)) { return $true }
    $builtAt = (Get-Item $index).LastWriteTimeUtc
    $watch = @(
        (Join-Path $Root 'apps\workstation\src'),
        (Join-Path $Root 'apps\workstation\index.html'),
        (Join-Path $Root 'apps\workstation\package.json'),
        (Join-Path $Root 'apps\workstation\vite.config.ts'),
        (Join-Path $Root 'apps\workstation\public'),
        (Join-Path $Root 'packages'),
        (Join-Path $Root 'VERSION'),
        (Join-Path $Root 'DEV_BUILD')
    )
    foreach ($path in $watch) {
        if (-not (Test-Path $path)) { continue }
        $items = if ((Get-Item -LiteralPath $path).PSIsContainer) {
            Get-ChildItem -LiteralPath $path -Recurse -File -ErrorAction SilentlyContinue
        } else { @(Get-Item -LiteralPath $path) }
        if ($items | Where-Object { $_.LastWriteTimeUtc -gt $builtAt } | Select-Object -First 1) { return $true }
    }
    return $false
}

function Test-ArcheonInstalledUiStale {
    $distIndex = Join-Path $Root 'apps\workstation\dist\index.html'
    $installedIndex = Join-Path $InstallUi 'index.html'
    if (-not (Test-Path $distIndex)) { return $true }
    if (-not (Test-Path $installedIndex)) { return $true }
    $distTime = (Get-Item -LiteralPath $distIndex).LastWriteTimeUtc
    $instTime = (Get-Item -LiteralPath $installedIndex).LastWriteTimeUtc
    return $distTime -gt $instTime.AddSeconds(1)
}

function Invoke-ArcheonCmd {
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [Parameter(Mandatory)][string]$LogPath
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    $here = Get-Location
    try {
        Set-Location $WorkingDirectory
        cmd.exe /c "$Command > `"$LogPath`" 2>&1"
        $code = $LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
        return [int]$code
    } finally {
        Set-Location $here
        $ErrorActionPreference = $prev
    }
}

function Write-ArcheonCompilerStatus {
    param(
        [string]$Phase,
        [string]$Version = '',
        [Nullable[bool]]$Ok = $null,
        [string]$ErrorText = ''
    )
    New-Item -ItemType Directory -Force -Path $InstallUi | Out-Null
    $body = @{
        phase   = $Phase
        version = $Version
        ok      = $Ok
        error   = $ErrorText
        at      = (Get-Date).ToString('o')
    } | ConvertTo-Json -Compress
    foreach ($dir in @($InstallUi, (Join-Path $Root 'apps\workstation\dist'))) {
        if (-not (Test-Path $dir)) { continue }
        [System.IO.File]::WriteAllText((Join-Path $dir 'compiler-status.json'), $body)
    }
}

function Wait-ArcheonExeUnlocked([string]$ExePath) {
    if (-not $ExePath -or -not (Test-Path -LiteralPath $ExePath)) { return }
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try {
            $fs = [System.IO.File]::Open($ExePath, 'Open', 'ReadWrite', 'None')
            $fs.Close()
            return
        } catch {
            Start-Sleep -Milliseconds 150
        }
    }
}

function Stop-StaleArcheonServer {
    $listener = Get-NetTCPConnection -LocalPort 8799 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $listener) { return }
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if (-not $process) { return }
    if ($process.ProcessName -ne 'archeon') {
        throw "Port 8799 is owned by an unexpected process: $($process.ProcessName)"
    }
    Stop-Process -Id $process.Id -Force
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (-not (Test-ArcheonServer)) { return }
        Start-Sleep -Milliseconds 200
    }
    throw 'The stale ARCHEON backend did not stop cleanly.'
}

function Publish-ArcheonUi {
    $dist = Join-Path $Root 'apps\workstation\dist'
    if (-not (Test-Path (Join-Path $dist 'index.html'))) {
        throw 'apps/workstation/dist/index.html missing after UI build.'
    }
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    $stage = Join-Path $InstallDir 'ui.next'
    if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
    Copy-Item -Recurse $dist $stage
    $bootSrc = Join-Path $Root 'apps\workstation\public\boot.html'
    if (Test-Path $bootSrc) { Copy-Item -Force $bootSrc (Join-Path $stage 'boot.html') }
    foreach ($mark in @('archeon.png', 'favicon.ico')) {
        $src = Join-Path $Root "apps\workstation\public\$mark"
        if (Test-Path $src) { Copy-Item -Force $src (Join-Path $stage $mark) }
    }
    if (Test-Path $InstallUi) { Remove-Item -Recurse -Force $InstallUi }
    Rename-Item $stage $InstallUi
    $exe = Get-ArcheonExe
    if ($exe) {
        $exeDir = Split-Path $exe -Parent
        $nextToExe = Join-Path $exeDir 'ui'
        $exeStage = Join-Path $exeDir 'ui.next'
        if (Test-Path $exeStage) { Remove-Item -Recurse -Force $exeStage }
        Copy-Item -Recurse $InstallUi $exeStage
        if (Test-Path $nextToExe) { Remove-Item -Recurse -Force $nextToExe }
        Rename-Item $exeStage $nextToExe
    }
    foreach ($name in @('VERSION', 'DEV_BUILD')) {
        $src = Join-Path $Root $name
        if (Test-Path $src) { Copy-Item -Force $src (Join-Path $InstallDir $name) }
    }
}

Add-ArcheonToolPath
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root 'logs') | Out-Null

$sourceVersion = Get-ArcheonSourceVersion
$devN = 0
$devFile = Join-Path $Root 'DEV_BUILD'
if (Test-Path $devFile) { [void][int]::TryParse((Get-Content $devFile -Raw).Trim(), [ref]$devN) }
$displayVersion = if ($devN -gt 0) { "$sourceVersion+dev.$devN" } else { $sourceVersion }
$serverHealthy = Test-ArcheonServer
$runningVersion = if ($serverHealthy) { Get-RunningArcheonVersion } else { '' }
$currentExe = Get-ArcheonExe
$sourceNewer = Test-ArcheonSourceNewerThanBinary $currentExe
$uiSrcStale = Test-ArcheonUiStale
$installedUiStale = Test-ArcheonInstalledUiStale
$runningRelease = if ($runningVersion) { ($runningVersion -split '\+')[0] } else { '' }
$versionMismatch = $serverHealthy -and $sourceVersion -and ($runningRelease -ne $sourceVersion)
$needUiCompile = $Force -or $CompileUi -or $uiSrcStale
$needCargo = $Force -or $sourceNewer -or $versionMismatch -or (-not $currentExe)
$needPublish = $Force -or $needUiCompile -or $installedUiStale -or $needCargo
$needRestart = $Force -or $needCargo -or $versionMismatch

$reason = @()
if ($Force) { $reason += 'force' }
if ($CompileUi) { $reason += 'icon compile UI' }
if ($versionMismatch) { $reason += "version $runningVersion->$sourceVersion" }
if ($sourceNewer) { $reason += 'backend sources newer than exe' }
if ($uiSrcStale) { $reason += 'frontend src newer than dist' }
if ($installedUiStale) { $reason += 'installed ui older than dist' }
if (-not $currentExe) { $reason += 'missing archeon.exe' }
Write-Host ("  [i] source={0} running={1} reason={2}" -f $sourceVersion, $(if ($runningVersion) { $runningVersion } else { 'none' }), $(if ($reason) { $reason -join '; ' } else { 'up to date' }))

if ($serverHealthy -and -not $needRestart -and -not $needUiCompile -and -not $needPublish) {
    Write-Host "  [OK] ARCHEON v$runningVersion already healthy - leaving it running" -ForegroundColor Green
    Write-ArcheonCompilerStatus -Phase 'ready' -Version $displayVersion -Ok $true
    return
}

if ($needUiCompile) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw 'Operator UI is stale and npm is missing from PATH.'
    }
    Write-Host '  [>] compile operator UI (npm run build)' -ForegroundColor Cyan
    $env:VITE_ARCHEON_VERSION = $displayVersion
    Write-Host ("  [i] VITE_ARCHEON_VERSION={0}" -f $env:VITE_ARCHEON_VERSION) -ForegroundColor DarkCyan
    Write-ArcheonCompilerStatus -Phase 'compiling-ui' -Version $displayVersion
    $uiDir = Join-Path $Root 'apps\workstation'
    $uiLog = Join-Path $Root 'logs\last-ui-build.txt'
    if (-not (Test-Path (Join-Path $uiDir 'node_modules'))) {
        $installCode = Invoke-ArcheonCmd -Command 'npm install' -WorkingDirectory $uiDir -LogPath (Join-Path $Root 'logs\last-npm-install.txt')
        if ($installCode -ne 0) { throw "npm install failed ($installCode)" }
    }
    $uiCode = Invoke-ArcheonCmd -Command 'npm run build' -WorkingDirectory $uiDir -LogPath $uiLog
    $built = Test-Path (Join-Path $uiDir 'dist\index.html')
    if ($uiCode -ne 0 -and -not $built) { throw "frontend build failed ($uiCode). See $uiLog" }
    if ($uiCode -ne 0) {
        Write-Host "  [!] npm reported $uiCode but dist exists - continuing" -ForegroundColor Yellow
    }
    $bootSrc = Join-Path $Root 'apps\workstation\public\boot.html'
    if ((Test-Path $bootSrc) -and (Test-Path (Join-Path $uiDir 'dist'))) {
        Copy-Item -Force $bootSrc (Join-Path $uiDir 'dist\boot.html')
    }
}

# Compile the native binary while the old API still serves boot.html, unless
# cargo would have to overwrite the running exe (cargo-target release).
$runningIsCargoRelease = $currentExe -and ($currentExe -replace '\\', '/') -match 'cargo-target/.*/archeon\.exe$'
if ($needCargo) {
    if ($serverHealthy -and $runningIsCargoRelease) {
        Write-Host '  [>] stop archeon so cargo can overwrite the running release exe' -ForegroundColor Cyan
        Stop-StaleArcheonServer
        Wait-ArcheonExeUnlocked $currentExe
        $serverHealthy = $false
    }
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        throw 'Rust/Cargo was not found. Install from https://rustup.rs and retry the icon.'
    }
    Write-Host '  [>] cargo build --release -p archeon-api' -ForegroundColor Cyan
    Write-ArcheonCompilerStatus -Phase 'compiling-native' -Version $displayVersion
    $cargoLog = Join-Path $Root 'logs\last-cargo.txt'
    $cargoCode = Invoke-ArcheonCmd -Command 'cargo build --release -p archeon-api' -WorkingDirectory $Root -LogPath $cargoLog
    if ($cargoCode -ne 0) { throw "cargo build failed ($cargoCode). See $cargoLog" }
}

if ($needRestart -and $serverHealthy) {
    Write-Host '  [>] stop archeon so the sealed UI and binary can be published' -ForegroundColor Cyan
    Stop-StaleArcheonServer
    Wait-ArcheonExeUnlocked $currentExe
}

if ($needPublish -or $needCargo) {
    Write-Host '  [>] publish UI into %LOCALAPPDATA%\ARCHEON\ui' -ForegroundColor Cyan
    Publish-ArcheonUi
}

$exe = Get-ArcheonExe
if (-not $exe) { throw 'archeon.exe was not produced.' }
if ($needCargo -or -not (Test-ArcheonServer)) {
    Copy-Item -Force $exe (Join-Path $InstallDir 'archeon.exe')
    $exe = Join-Path $InstallDir 'archeon.exe'
}
$ico = Join-Path $Root 'assets\brand\archeon.ico'
if (Test-Path $ico) { Copy-Item -Force $ico (Join-Path $InstallDir 'archeon.ico') }
Set-Content -Path (Join-Path $InstallDir 'VERSION') -Value $sourceVersion -NoNewline
$devBuild = Join-Path $Root 'DEV_BUILD'
if (Test-Path $devBuild) { Copy-Item -Force $devBuild (Join-Path $InstallDir 'DEV_BUILD') }

if (-not (Test-ArcheonServer)) {
    Write-Host '  [>] launch archeon (hidden)' -ForegroundColor Cyan
    $env:ARCHEON_UI_DIR = $InstallUi
    $env:ARCHEON_NO_OPEN = '1'
    $env:ARCHEON_ROOT = $Root
    $env:ARCHEON_PROJECT = 'projects/archeon-arm'
    $env:PYTHONPATH = Join-Path $Root 'workers\cad-occt'
    Start-Process -FilePath $exe -ArgumentList '--no-open' -WorkingDirectory $Root -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-ArcheonServer) {
            Write-Host ('  [OK] http://127.0.0.1:8799  v{0}' -f $displayVersion) -ForegroundColor Green
            break
        }
        Start-Sleep -Milliseconds 400
    }
    if (-not (Test-ArcheonServer)) {
        throw 'ARCHEON did not become healthy at http://127.0.0.1:8799/api/health'
    }
}

Write-ArcheonCompilerStatus -Phase 'ready' -Version $displayVersion -Ok $true
Write-Host ("  [OK] compiler sealed v{0}" -f $displayVersion) -ForegroundColor Green
