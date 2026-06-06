<#
  PathMap - one-click local launcher (engine).
  You normally don't run this directly: double-click "START PATHMAP.bat".

  On first run this sets up the Python virtual environment and installs the
  backend + frontend dependencies. After that it just starts both servers and
  opens the app in your browser. Safe to run repeatedly.
#>

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'
$venv = Join-Path $root '.venv'
$venvPython = Join-Path $venv 'Scripts\python.exe'
$depMarker = Join-Path $venv '.pathmap-deps-ok'

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Note($msg) { Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-Bad($msg) { Write-Host "  [X] $msg" -ForegroundColor Red }

function Test-PortOpen([int]$port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect('127.0.0.1', $port, $null, $null)
    $hit = $async.AsyncWaitHandle.WaitOne(400)
    $connected = $hit -and $client.Connected
    $client.Close()
    return $connected
  } catch {
    return $false
  }
}

function Test-CommandExists($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

Clear-Host
Write-Host ''
Write-Host '  ===============================================' -ForegroundColor DarkCyan
Write-Host '    PathMap - starting up' -ForegroundColor White
Write-Host '  ===============================================' -ForegroundColor DarkCyan
Write-Host ''

# 1) Prerequisites -----------------------------------------------------------
$pythonCmd = $null
foreach ($candidate in @('python', 'py')) {
  if (Test-CommandExists $candidate) { $pythonCmd = $candidate; break }
}
if (-not $pythonCmd) {
  Write-Bad 'Python 3.11+ is not installed or not on PATH.'
  Write-Host "      Get it from https://www.python.org/downloads/ and tick 'Add python.exe to PATH'." -ForegroundColor Gray
  Read-Host '  Press Enter to close'
  exit 1
}
if (-not (Test-CommandExists 'npm')) {
  Write-Bad 'Node.js / npm is not installed or not on PATH.'
  Write-Host '      Get Node 18+ from https://nodejs.org/ then run this again.' -ForegroundColor Gray
  Read-Host '  Press Enter to close'
  exit 1
}
Write-Ok 'Python and Node found.'

# 2) Python virtual environment ---------------------------------------------
if (-not (Test-Path $venvPython)) {
  Write-Step 'Creating Python virtual environment (first run only)...'
  & $pythonCmd -m venv $venv
  Write-Ok 'Virtual environment created.'
}

# 3) Backend dependencies (only when missing or requirements changed) --------
$reqFile = Join-Path $backend 'requirements.txt'
$needDeps = $true
if ((Test-Path $depMarker) -and (Test-Path $reqFile)) {
  if ((Get-Item $depMarker).LastWriteTimeUtc -ge (Get-Item $reqFile).LastWriteTimeUtc) {
    $needDeps = $false
  }
}
if ($needDeps) {
  Write-Step 'Installing backend dependencies (this can take a minute)...'
  & $venvPython -m pip install --upgrade pip --quiet
  & $venvPython -m pip install -r $reqFile --quiet
  Set-Content -Path $depMarker -Value (Get-Date).ToString('o')
  Write-Ok 'Backend dependencies ready.'
} else {
  Write-Ok 'Backend dependencies already installed.'
}

# 4) Frontend dependencies ---------------------------------------------------
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
  Write-Step 'Installing frontend dependencies (first run only, can take a few minutes)...'
  Push-Location $frontend
  try { & npm install } finally { Pop-Location }
  Write-Ok 'Frontend dependencies ready.'
} else {
  Write-Ok 'Frontend dependencies already installed.'
}

# 5) Start backend (port 8000) ----------------------------------------------
if (Test-PortOpen 8000) {
  Write-Ok 'Backend already running on http://localhost:8000'
} else {
  Write-Step 'Starting backend on http://localhost:8000 ...'
  Start-Process -FilePath $venvPython -ArgumentList 'main.py' -WorkingDirectory $backend -WindowStyle Minimized
}

# 6) Start frontend (port 3002) ---------------------------------------------
if (Test-PortOpen 3002) {
  Write-Ok 'Frontend already running on http://localhost:3002'
} else {
  Write-Step 'Starting frontend on http://localhost:3002 ...'
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' -WorkingDirectory $frontend -WindowStyle Minimized
}

# 7) Wait for the app, then open the browser --------------------------------
Write-Step 'Waiting for the app to be ready...'
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  if (Test-PortOpen 3002) { $ready = $true; break }
  Start-Sleep -Milliseconds 700
}

Write-Host ''
if ($ready) {
  Start-Process 'http://localhost:3002'
  $ip = $null
  try {
    $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } |
      Select-Object -First 1).IPAddress
  } catch {}
  Write-Ok 'PathMap is running!'
  Write-Host '      App:      http://localhost:3002' -ForegroundColor White
  Write-Host '      Backend:  http://localhost:8000   (API docs at /docs)' -ForegroundColor White
  if ($ip) { Write-Host "      Phone on same Wi-Fi:  http://${ip}:3002" -ForegroundColor White }
  Write-Host ''
  Write-Host '  Two minimized windows are running the servers. Close them to stop PathMap.' -ForegroundColor Gray
} else {
  Write-Note 'The app did not respond yet. Give it a minute, then open http://localhost:3002 manually.'
}
Write-Host ''
Read-Host '  Press Enter to close this window (the servers keep running)'
