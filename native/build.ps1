# Builds and installs the optional pathmap_core Rust extension into the active
# Python environment. Safe to skip entirely - the backend falls back to pure
# Python when the module is absent.
$ErrorActionPreference = "Stop"

$crate = Join-Path $PSScriptRoot "pathmap_core"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Error "Rust toolchain not found. Install from https://rustup.rs then re-run."
}
if (-not (Get-Command maturin -ErrorAction SilentlyContinue)) {
    Write-Host "maturin not found; installing into the active environment..."
    pip install maturin
}

Write-Host "Building pathmap_core (release)..."
Push-Location $crate
try {
    maturin develop --release
    Write-Host "pathmap_core installed. Restart the backend to use the native router."
}
finally {
    Pop-Location
}
