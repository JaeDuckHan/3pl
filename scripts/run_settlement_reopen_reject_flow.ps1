param(
  [string]$BaseUrl = "http://localhost:3100",
  [string]$Email = "admin.demo@example.com",
  [string]$Password = "1234",
  [int]$ClientId = 0,
  [int]$WarehouseId = 201,
  [int]$UserId = 0,
  [int]$ProductId = 401,
  [int]$LotId = 501,
  [string]$LotNo = "LOT-DEMO-001",
  [int]$InboundQty = 20,
  [int]$OutboundQty = 10,
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

function Assert-Ok($res, $step) {
  if (-not $res.ok) { throw "[$step] ok=false" }
}
function Select-IdByField($rows, $fieldName, $expectedValue) {
  if (-not $rows) { return $null }
  foreach ($row in $rows) {
    if ($row.$fieldName -eq $expectedValue) { return [int]$row.id }
  }
  return $null
}

$serverProcess = $null
$cleanupErrors = @()
$authHeader = $null
$created = @{ inboundOrderId=$null; inboundItemId=$null; outboundOrderId=$null; outboundItemId=$null }

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
  $billingMonth = (Get-Date).ToString("yyyy-MM")

  $login = Invoke-Api -Method POST -Url "$BaseUrl/auth/login" -Body @{ email=$Email; password=$Password }
  Assert-Ok $login "login"
  $authHeader = @{ Authorization = "Bearer $($login.data.token)" }
  Write-Host "LOGIN_OK=$($login.ok)"

  $me = Invoke-Api -Method GET -Url "$BaseUrl/auth/me" -Headers $authHeader
  Assert-Ok $me "auth-me"
  if ($UserId -le 0) { $UserId = [int]$me.data.id }
  if ($ClientId -le 0) { $ClientId = [int]$me.data.client_id }

  if ($LotId -le 0) {
    $lotList = Invoke-Api -Method GET -Url "$BaseUrl/product-lots?product_id=$ProductId&status=active" -Headers $authHeader
    Assert-Ok $lotList "product-lots-list"
    $LotId = Select-IdByField @($lotList.data) "lot_no" $LotNo
    if (-not $LotId -and @($lotList.data).Count -gt 0) {
      $LotId = [int]$lotList.data[0].id
    }
  }

  if ($LotId -le 0) {
    throw "[preflight] invalid LotId. Use -LotId explicitly or ensure active lot exists for product."
  }

  $ib = Invoke-Api -Method POST -Url "$BaseUrl/inbound-orders" -Headers $authHeader -Body @{
    inbound_no="IB-RJ-$ts"; client_id=$ClientId; warehouse_id=$WarehouseId; inbound_date=$today; status="draft"; memo="reopen reject inbound"; created_by=$UserId
  }
  Assert-Ok $ib "inbound-order"
  $created.inboundOrderId = [int]$ib.data.id

  $ibi = Invoke-Api -Method POST -Url "$BaseUrl/inbound-items" -Headers $authHeader -Body @{
    inbound_order_id=$created.inboundOrderId; product_id=$ProductId; lot_id=$LotId; qty=$InboundQty; invoice_price=10.0; currency="THB"; remark="reopen reject inbound item"
  }
  Assert-Ok $ibi "inbound-item"
  $created.inboundItemId = [int]$ibi.data.id

  $ob = Invoke-Api -Method POST -Url "$BaseUrl/outbound-orders" -Headers $authHeader -Body @{
    outbound_no="OB-RJ-$ts"; client_id=$ClientId; warehouse_id=$WarehouseId; order_date=$today; status="draft"; created_by=$UserId
  }
  Assert-Ok $ob "outbound-order"
  $created.outboundOrderId = [int]$ob.data.id

  $obi = Invoke-Api -Method POST -Url "$BaseUrl/outbound-items" -Headers $authHeader -Body @{
    outbound_order_id=$created.outboundOrderId; product_id=$ProductId; lot_id=$LotId; qty=$OutboundQty; box_type="BOX"; box_count=1; remark="reopen reject outbound item"
  }
  Assert-Ok $obi "outbound-item"
  $created.outboundItemId = [int]$obi.data.id

  $gen = Invoke-Api -Method POST -Url "$BaseUrl/settlement-batches/generate" -Headers $authHeader -Body @{
    client_id=$ClientId; billing_month=$billingMonth; created_by=$UserId; is_provisional=1
  }
  Assert-Ok $gen "settlement-generate"
  $batchId = [int]$gen.data.batch.id

  $close = Invoke-Api -Method POST -Url "$BaseUrl/settlement-batches/$batchId/close" -Headers $authHeader -Body @{ closed_by=$UserId; reason="reject-flow close" }
  Assert-Ok $close "close"

  $req = Invoke-Api -Method POST -Url "$BaseUrl/settlement-batches/$batchId/reopen-requests" -Headers $authHeader -Body @{ requested_by=$UserId; reason="reject-flow request" }
  Assert-Ok $req "reopen-request"
  $requestId = [int]$req.data.id

  $reject = Invoke-Api -Method POST -Url "$BaseUrl/settlement-reopen-requests/$requestId/reject" -Headers $authHeader -Body @{ approved_by=$UserId; reason="reject-flow reject" }
  Assert-Ok $reject "reopen-reject"
  $statusReq = [string]$reject.data.status
  if ($statusReq -ne "rejected") { throw "expected request status rejected, got $statusReq" }

  $batch = Invoke-Api -Method GET -Url "$BaseUrl/settlement-batches/$batchId" -Headers $authHeader
  Assert-Ok $batch "batch-get"
  $batchStatus = [string]$batch.data.batch.status
  if ($batchStatus -ne "closed") { throw "expected batch status closed, got $batchStatus" }

  Write-Host "REOPEN_REJECT_OK=True REQUEST_STATUS=$statusReq BATCH_STATUS=$batchStatus"
  Write-Host "FLOW_OK=True"
} finally {
  if ($created.outboundItemId) { try { $null = Invoke-Api -Method DELETE -Url "$BaseUrl/outbound-items/$($created.outboundItemId)" -Headers $authHeader } catch { $cleanupErrors += "outbound-item delete failed" } }
  if ($created.outboundOrderId) { try { $null = Invoke-Api -Method DELETE -Url "$BaseUrl/outbound-orders/$($created.outboundOrderId)" -Headers $authHeader } catch { $cleanupErrors += "outbound-order delete failed" } }
  if ($created.inboundItemId) { try { $null = Invoke-Api -Method DELETE -Url "$BaseUrl/inbound-items/$($created.inboundItemId)" -Headers $authHeader } catch { $cleanupErrors += "inbound-item delete failed" } }
  if ($created.inboundOrderId) { try { $null = Invoke-Api -Method DELETE -Url "$BaseUrl/inbound-orders/$($created.inboundOrderId)" -Headers $authHeader } catch { $cleanupErrors += "inbound-order delete failed" } }

  if ($serverProcess -and -not $serverProcess.HasExited) { try { Stop-Process -Id $serverProcess.Id -Force } catch {} }

  if ($cleanupErrors.Count -eq 0) { Write-Host "CLEANUP_OK=True" } else {
    Write-Host "CLEANUP_OK=False"
    $cleanupErrors | ForEach-Object { Write-Host "CLEANUP_ERROR=$_" }
  }
}
