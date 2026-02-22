param(
  [int]$Port = 3016
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stableRoot = "D:\codexlink\wms-web"
$runRoot = if (Test-Path $stableRoot) { $stableRoot } else { $root }
Set-Location $runRoot

Write-Host "[dev-clean] Project root: $root"
Write-Host "[dev-clean] Run root: $runRoot"
Write-Host "[dev-clean] Target port: $Port"

# 1) Stop any process that is already listening on the target port.
$portPids = @(Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($targetPid in $portPids) {
  if ($targetPid) {
    try {
      Stop-Process -Id $targetPid -Force -ErrorAction Stop
      Write-Host "[dev-clean] Stopped process on port $Port (PID: $targetPid)"
    } catch {
      Write-Host "[dev-clean] Failed to stop PID ${targetPid}: $($_.Exception.Message)"
    }
  }
}

Start-Sleep -Seconds 1

# 2) Remove unstable Next.js cache/build artifacts.
$nextDir = Join-Path $runRoot ".next"
if (Test-Path $nextDir) {
  Remove-Item -Recurse -Force $nextDir
  Write-Host "[dev-clean] Removed .next cache."
}

$outLog = Join-Path $runRoot ".tmp-dev-clean.out.log"
$errLog = Join-Path $runRoot ".tmp-dev-clean.err.log"
if (Test-Path $outLog) { Remove-Item -Force $outLog -ErrorAction SilentlyContinue }
if (Test-Path $errLog) { Remove-Item -Force $errLog -ErrorAction SilentlyContinue }

# 3) Start dev server in background and verify health.
$cmd = "set PORT=$Port&& npm run dev > .tmp-dev-clean.out.log 2> .tmp-dev-clean.err.log"
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd -WorkingDirectory $runRoot -PassThru
Write-Host "[dev-clean] Started dev server (PID: $($proc.Id))."

$url = "http://127.0.0.1:$Port/login"
$ok = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 2
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $ok = $true
      Write-Host "[dev-clean] Health check: $url -> $($response.StatusCode)"
      break
    }
  } catch {
    # Retry while startup/chunk files are being generated.
  }
}

if (-not $ok) {
  Write-Host "[dev-clean] Health check failed after retries."
  Write-Host "[dev-clean] Check logs:"
  Write-Host "  $outLog"
  Write-Host "  $errLog"
  exit 1
}

Write-Host "[dev-clean] Ready. Open: http://127.0.0.1:$Port"
Write-Host "[dev-clean] If needed, stop with: Stop-Process -Id $($proc.Id) -Force"
