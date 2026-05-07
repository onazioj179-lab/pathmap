# =====================================================================
# PATHMAP - DEVELOPMENT ENVIRONMENT STARTER
# All-in-one script to launch frontend + backend servers
# =====================================================================
# Author: Onazi Treasure
# Watermark: OJ
# =====================================================================

Write-Host "`n==============================================" -ForegroundColor Cyan
Write-Host "   PATHMAP Development Environment" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

# Get local IP for phone/network access
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like "192.168.*"}).IPAddress | Select-Object -First 1

# Check if backend is already running
$backendRunning = Test-NetConnection -ComputerName localhost -Port 8000 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($backendRunning) {
    Write-Host "[OK] Backend already running on port 8000" -ForegroundColor Green
} else {
    Write-Host "[START] Launching backend server..." -ForegroundColor Yellow
    $backendPath = Join-Path $PSScriptRoot "backend"
    $pythonPath = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
    
    if (Test-Path $pythonPath) {
        Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; & '$pythonPath' main.py" -WindowStyle Normal
        Write-Host "[WAIT] Waiting for backend to initialize..." -ForegroundColor Gray
        Start-Sleep -Seconds 5
        
        # Verify backend started
        $backendCheck = Test-NetConnection -ComputerName localhost -Port 8000 -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($backendCheck) {
            Write-Host "[OK] Backend started successfully" -ForegroundColor Green
        } else {
            Write-Host "[WARN] Backend may still be starting..." -ForegroundColor Yellow
        }
    } else {
        Write-Host "[ERROR] Python virtual environment not found at $pythonPath" -ForegroundColor Red
        Write-Host "[INFO] Run: python -m venv .venv" -ForegroundColor Yellow
    }
}

# Check if frontend is already running
$frontendRunning = Test-NetConnection -ComputerName localhost -Port 3002 -InformationLevel Quiet -WarningAction SilentlyContinue
if ($frontendRunning) {
    Write-Host "[OK] Frontend already running on port 3002" -ForegroundColor Green
} else {
    Write-Host "[START] Launching frontend server..." -ForegroundColor Yellow
    $frontendPath = Join-Path $PSScriptRoot "frontend"
    
    if (Test-Path (Join-Path $frontendPath "package.json")) {
        Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev" -WindowStyle Normal
        Write-Host "[WAIT] Waiting for frontend to initialize..." -ForegroundColor Gray
        Start-Sleep -Seconds 5
        
        # Verify frontend started
        $frontendCheck = Test-NetConnection -ComputerName localhost -Port 3002 -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($frontendCheck) {
            Write-Host "[OK] Frontend started successfully" -ForegroundColor Green
        } else {
            Write-Host "[WARN] Frontend may still be starting..." -ForegroundColor Yellow
        }
    } else {
        Write-Host "[ERROR] Frontend directory not found or package.json missing" -ForegroundColor Red
        Write-Host "[INFO] Run: cd frontend && npm install" -ForegroundColor Yellow
    }
}

# Display access URLs
Write-Host "`n==============================================" -ForegroundColor Cyan
Write-Host "   PATHMAP is ready!" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Cyan

Write-Host "`nLocal Access:" -ForegroundColor White
Write-Host "  Frontend:  http://localhost:3002" -ForegroundColor White
Write-Host "  Backend:   http://localhost:8000" -ForegroundColor White
Write-Host "  API Docs:  http://localhost:8000/docs" -ForegroundColor White

if ($localIP) {
    Write-Host "`nNetwork Access (Phone/Tablet):" -ForegroundColor Yellow
    Write-Host "  Frontend:  http://${localIP}:3002" -ForegroundColor Yellow
    Write-Host "  Backend:   http://${localIP}:8000" -ForegroundColor Yellow
}

Write-Host "`nBoth servers are running in separate windows." -ForegroundColor Gray
Write-Host "Close the terminal windows to stop the servers.`n" -ForegroundColor Gray
