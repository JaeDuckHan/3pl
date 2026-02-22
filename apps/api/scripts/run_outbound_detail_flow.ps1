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
$outboundOrderId = $null

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
  $packedIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

  $login = Invoke-Api -Method POST -Url "$BaseUrl/auth/login" -Body @{ email=$Email; password=$Password }
  if (-not $login.ok) { throw "login failed" }
  $authHeader = @{ Authorization = "Bearer $($login.data.token)" }
  Write-Host "LOGIN_OK=$($login.ok)"

  $created = Invoke-Api -Method POST -Url "$BaseUrl/outbound-orders" -Headers $authHeader -Body @{
    outbound_no="OB-DETAIL-$ts"; client_id=$ClientId; warehouse_id=$WarehouseId; order_date=$today; status="draft"; created_by=$UserId
  }
  if (-not $created.ok) { throw "outbound order create failed" }
  $outboundOrderId = [int]$created.data.id
  Write-Host "ORDER_CREATE_OK=True ORDER_ID=$outboundOrderId"

  $boxNo = "BOX-DETAIL-$ts"
  $box = Invoke-Api -Method POST -Url "$BaseUrl/outbound-orders/$outboundOrderId/boxes" -Headers $authHeader -Body @{
    box_no=$boxNo; courier="E2E"; tracking_no="TRK-$boxNo"; item_count=1
  }
  if (-not $box.ok) { throw "box create failed" }
  Write-Host "BOX_CREATE_OK=True BOX_ID=$($box.data.id)"

  $boxes = Invoke-Api -Method GET -Url "$BaseUrl/outbound-orders/$outboundOrderId/boxes" -Headers $authHeader
  if (-not $boxes.ok) { throw "box list failed" }
  Write-Host "BOX_LIST_OK=True COUNT=$(@($boxes.data).Count)"

  $before = Invoke-Api -Method GET -Url "$BaseUrl/outbound-orders/$outboundOrderId" -Headers $authHeader
  if (-not $before.ok) { throw "detail before update failed" }

  $updated = Invoke-Api -Method PUT -Url "$BaseUrl/outbound-orders/$outboundOrderId" -Headers $authHeader -Body @{
    outbound_no=$before.data.outbound_no
    client_id=$before.data.client_id
    warehouse_id=$before.data.warehouse_id
    order_date=$today
    sales_channel=$before.data.sales_channel
    order_no=$before.data.order_no
    tracking_no=$before.data.tracking_no
    status="packed"
    packed_at=$packedIso
    shipped_at=$before.data.shipped_at
    created_by=$before.data.created_by
  }
  if (-not $updated.ok) { throw "status transition failed" }

  $after = Invoke-Api -Method GET -Url "$BaseUrl/outbound-orders/$outboundOrderId" -Headers $authHeader
  if (-not $after.ok) { throw "detail after update failed" }
  if ($after.data.status -ne "packed") { throw "expected packed status, got $($after.data.status)" }

  Write-Host "TRANSITION_OK=True BEFORE=$($before.data.status) AFTER=$($after.data.status)"
  Write-Host "FLOW_OK=True"
} finally {
  if ($outboundOrderId) {
    try { $null = Invoke-Api -Method DELETE -Url "$BaseUrl/outbound-orders/$outboundOrderId" -Headers $authHeader } catch {}
  }
  if ($serverProcess -and -not $serverProcess.HasExited) { try { Stop-Process -Id $serverProcess.Id -Force } catch {} }
}
