param(
  [string]$BaseUrl = "http://localhost:3100",
  [string]$Email = "admin.demo@example.com",
  [string]$Password = "1234",
  [int]$ClientId = 101,
  [int]$WarehouseId = 201,
  [int]$UserId = 1002,
  [switch]$StartServerIfDown = $true
)

$ErrorActionPreference = "Stop"

function Invoke-Api {
  param(
    [ValidateSet("GET", "POST", "PUT", "DELETE")]
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    [object]$Body
  )
  $params = @{ Method = $Method; Uri = $Url; ErrorAction = "Stop" }
  if ($Headers) { $params.Headers = $Headers }
  if ($PSBoundParameters.ContainsKey("Body") -and $null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 10)
  }
  Invoke-RestMethod @params
}

$serverProcess = $null
$authHeader = $null
$inboundOrderId = $null

try {
  if ($StartServerIfDown) {
    try { $null = Invoke-Api -Method GET -Url "$BaseUrl/health" } catch {
      $serverProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "node src/server.js" -WorkingDirectory "$PSScriptRoot\.." -PassThru
      Start-Sleep -Seconds 2
      $null = Invoke-Api -Method GET -Url "$BaseUrl/health"
    }
  }

  $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $receivedIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

  $login = Invoke-Api -Method POST -Url "$BaseUrl/auth/login" -Body @{ email=$Email; password=$Password }
  if (-not $login.ok) { throw "login failed" }
  $authHeader = @{ Authorization = "Bearer $($login.data.token)" }
  Write-Host "LOGIN_OK=$($login.ok)"

  $created = Invoke-Api -Method POST -Url "$BaseUrl/inbound-orders" -Headers $authHeader -Body @{
    inbound_no="IB-DETAIL-$ts"; client_id=$ClientId; warehouse_id=$WarehouseId; inbound_date=$today; status="draft"; memo="inbound detail e2e"; created_by=$UserId
  }
  if (-not $created.ok) { throw "inbound order create failed" }
  $inboundOrderId = [int]$created.data.id
  Write-Host "ORDER_CREATE_OK=True ORDER_ID=$inboundOrderId"

  $before = Invoke-Api -Method GET -Url "$BaseUrl/inbound-orders/$inboundOrderId" -Headers $authHeader
  if (-not $before.ok) { throw "detail before update failed" }

  $updated = Invoke-Api -Method PUT -Url "$BaseUrl/inbound-orders/$inboundOrderId" -Headers $authHeader -Body @{
    inbound_no=$before.data.inbound_no
    client_id=$before.data.client_id
    warehouse_id=$before.data.warehouse_id
    inbound_date=$today
    status="received"
    memo=$before.data.memo
    created_by=$before.data.created_by
    received_at=$receivedIso
  }
  if (-not $updated.ok) { throw "status transition failed" }

  $after = Invoke-Api -Method GET -Url "$BaseUrl/inbound-orders/$inboundOrderId" -Headers $authHeader
  if (-not $after.ok) { throw "detail after update failed" }
  if ($after.data.status -ne "received") { throw "expected received status, got $($after.data.status)" }

  Write-Host "TRANSITION_OK=True BEFORE=$($before.data.status) AFTER=$($after.data.status)"
  Write-Host "FLOW_OK=True"
} finally {
  if ($inboundOrderId) {
    try { $null = Invoke-Api -Method DELETE -Url "$BaseUrl/inbound-orders/$inboundOrderId" -Headers $authHeader } catch {}
  }
  if ($serverProcess -and -not $serverProcess.HasExited) { try { Stop-Process -Id $serverProcess.Id -Force } catch {} }
}
