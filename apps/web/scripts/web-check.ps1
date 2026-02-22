param(
  [int]$Port = 3016
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$stableRoot = "D:\codexlink\wms-web"
$runRoot = if (Test-Path $stableRoot) { $stableRoot } else { $root }
Set-Location $runRoot

Write-Host "[web-check] Project root: $root"
Write-Host "[web-check] Run root: $runRoot"
Write-Host "[web-check] Target port: $Port"

# 1) Stop current listeners on this port.
$portPids = @(Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
foreach ($targetPid in $portPids) {
  if ($targetPid) {
    try { Stop-Process -Id $targetPid -Force -ErrorAction Stop } catch {}
  }
}
Start-Sleep -Seconds 1

# 2) Clean output/cache.
$nextDir = Join-Path $runRoot ".next"
$outLog = Join-Path $runRoot ".tmp-web-check.out.log"
$errLog = Join-Path $runRoot ".tmp-web-check.err.log"
if (Test-Path $nextDir) { Remove-Item -Recurse -Force $nextDir }
if (Test-Path $outLog) { Remove-Item $outLog -Force -ErrorAction SilentlyContinue }
if (Test-Path $errLog) { Remove-Item $errLog -Force -ErrorAction SilentlyContinue }

# 3) Build once (stable assets/chunks).
Write-Host "[web-check] Running production build..."
npm run build
if ($LASTEXITCODE -ne 0) {
  Write-Host "[web-check] Build failed. Aborting startup."
  exit $LASTEXITCODE
}

# 4) Start production server.
$cmd = "set PORT=$Port&& npm run start > .tmp-web-check.out.log 2> .tmp-web-check.err.log"
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd -WorkingDirectory $runRoot -PassThru
Write-Host "[web-check] Started server (PID: $($proc.Id))."

$url = "http://127.0.0.1:$Port/login"
try {
  $ok = $false
  for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        $ok = $true
        Write-Host "[web-check] Health check: $url -> $($response.StatusCode)"
        break
      }
    } catch {
      # retry
    }
  }
  if (-not $ok) { throw "health check timeout" }
} catch {
  Write-Host "[web-check] Health check failed: $($_.Exception.Message)"
  Write-Host "[web-check] Check logs:"
  Write-Host "  $outLog"
  Write-Host "  $errLog"
  try { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } catch {}
  exit 1
}

Write-Host "[web-check] Ready for visual QA: http://127.0.0.1:$Port"
Write-Host "[web-check] Stop server: Stop-Process -Id $($proc.Id) -Force"
