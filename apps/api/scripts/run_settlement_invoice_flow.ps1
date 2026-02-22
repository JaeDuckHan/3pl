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
  [string]$WarehouseCode = "WH-DEMO-001",
  [string]$ProductBarcodeFull = "880000000001-TH",
  [int]$InboundQty = 20,
  [int]$OutboundQty = 10,
  [switch]$StartServerIfDown = $true
)

$ErrorActionPreference = "Stop"

function ConvertTo-JsonBody([object]$value) {
  return ($value | ConvertTo-Json -Depth 10)
}

function Invoke-Api {
  param(
    [ValidateSet("GET", "POST", "PUT", "DELETE")]
    [string]$Method,
    [string]$Url,
    [hashtable]$Headers,
    [object]$Body
  )

  $params = @{
    Method = $Method
    Uri = $Url
    ErrorAction = "Stop"
  }

  if ($Headers) {
    $params.Headers = $Headers
  }

  if ($PSBoundParameters.ContainsKey("Body") -and $null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ConvertTo-JsonBody $Body
  }

  return Invoke-RestMethod @params
}

function Assert-Ok {
  param(
    [object]$Response,
    [string]$Step
  )

  if (-not $Response.ok) {
    throw "[$Step] API returned ok=false"
  }
}

function Select-IdByField {
  param(
    [object[]]$Rows,
    [string]$FieldName,
    [string]$ExpectedValue
  )

  if (-not $Rows) {
    return $null
  }

  foreach ($row in $Rows) {
    if ($row.$FieldName -eq $ExpectedValue) {
      return [int]$row.id
    }
  }

  return $null
}

$serverProcess = $null
$cleanupErrors = @()

$created = @{
  inboundItemId = $null
  inboundOrderId = $null
  outboundItemId = $null
  outboundOrderId = $null
}

try {
  if ($StartServerIfDown) {
    try {
      $null = Invoke-Api -Method GET -Url "$BaseUrl/health"
    } catch {
      Write-Host "[INFO] API not reachable. Starting local server..."
      $serverProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "node src/server.js" -WorkingDirectory "$PSScriptRoot\.." -PassThru
      Start-Sleep -Seconds 2
      $null = Invoke-Api -Method GET -Url "$BaseUrl/health"
    }
  }

  $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $billingMonth = (Get-Date).ToString("yyyy-MM")
  $dueDate = (Get-Date).AddDays(7).ToString("yyyy-MM-dd")

  $login = Invoke-Api -Method POST -Url "$BaseUrl/auth/login" -Body @{
    email = $Email
    password = $Password
  }
  Assert-Ok -Response $login -Step "login"
  $token = $login.data.token
  if (-not $token) {
    throw "[login] missing token"
  }
  $authHeader = @{ Authorization = "Bearer $token" }
  Write-Host "LOGIN_OK=$($login.ok)"

  $me = Invoke-Api -Method GET -Url "$BaseUrl/auth/me" -Headers $authHeader
  Assert-Ok -Response $me -Step "auth-me"

  if ($UserId -le 0) {
    $UserId = [int]$me.data.id
  }
  if ($ClientId -le 0) {
    $ClientId = [int]$me.data.client_id
  }

  if ($WarehouseId -le 0) {
    $warehouseList = Invoke-Api -Method GET -Url "$BaseUrl/warehouses" -Headers $authHeader
    Assert-Ok -Response $warehouseList -Step "warehouses-list"
    $WarehouseId = Select-IdByField -Rows @($warehouseList.data) -FieldName "code" -ExpectedValue $WarehouseCode
    if (-not $WarehouseId -and @($warehouseList.data).Count -gt 0) {
      $WarehouseId = [int]$warehouseList.data[0].id
    }
  }

  if ($ProductId -le 0) {
    $productList = Invoke-Api -Method GET -Url "$BaseUrl/products" -Headers $authHeader
    Assert-Ok -Response $productList -Step "products-list"
    $clientProducts = @($productList.data) | Where-Object { [int]$_.client_id -eq $ClientId }
    $ProductId = Select-IdByField -Rows $clientProducts -FieldName "barcode_full" -ExpectedValue $ProductBarcodeFull
    if (-not $ProductId -and $clientProducts.Count -gt 0) {
      $ProductId = [int]$clientProducts[0].id
    }
  }

  if ($LotId -le 0) {
    $lotList = Invoke-Api -Method GET -Url "$BaseUrl/product-lots?product_id=$ProductId&status=active" -Headers $authHeader
    Assert-Ok -Response $lotList -Step "product-lots-list"
    $LotId = Select-IdByField -Rows @($lotList.data) -FieldName "lot_no" -ExpectedValue $LotNo
    if (-not $LotId -and @($lotList.data).Count -gt 0) {
      $LotId = [int]$lotList.data[0].id
    }
  }

  if ($WarehouseId -le 0 -or $ProductId -le 0 -or $LotId -le 0) {
    throw "[preflight] invalid IDs. Use -WarehouseId/-ProductId/-LotId explicitly."
  }

  Write-Host "CTX_USER_ID=$UserId CTX_CLIENT_ID=$ClientId CTX_WAREHOUSE_ID=$WarehouseId CTX_PRODUCT_ID=$ProductId CTX_LOT_ID=$LotId"

  # 1) Prepare stock by inbound (precondition for outbound shipment)
  $inboundOrder = Invoke-Api -Method POST -Url "$BaseUrl/inbound-orders" -Headers $authHeader -Body @{
    inbound_no = "IB-INT-$ts"
    client_id = $ClientId
    warehouse_id = $WarehouseId
    inbound_date = $today
    status = "draft"
    memo = "integration-flow inbound"
    created_by = $UserId
  }
  Assert-Ok -Response $inboundOrder -Step "inbound-order-create"
  $created.inboundOrderId = [int]$inboundOrder.data.id

  $inboundItem = Invoke-Api -Method POST -Url "$BaseUrl/inbound-items" -Headers $authHeader -Body @{
    inbound_order_id = $created.inboundOrderId
    product_id = $ProductId
    lot_id = $LotId
    qty = $InboundQty
    invoice_price = 10.5
    currency = "THB"
    remark = "integration-flow inbound item"
  }
  Assert-Ok -Response $inboundItem -Step "inbound-item-create"
  $created.inboundItemId = [int]$inboundItem.data.id

  # 2) Outbound -> service event auto-generation
  $outboundOrder = Invoke-Api -Method POST -Url "$BaseUrl/outbound-orders" -Headers $authHeader -Body @{
    outbound_no = "OB-INT-$ts"
    client_id = $ClientId
    warehouse_id = $WarehouseId
    order_date = $today
    sales_channel = "integration-test"
    order_no = "SO-$ts"
    tracking_no = "TRK-$ts"
    status = "draft"
    created_by = $UserId
  }
  Assert-Ok -Response $outboundOrder -Step "outbound-order-create"
  $created.outboundOrderId = [int]$outboundOrder.data.id

  $outboundItem = Invoke-Api -Method POST -Url "$BaseUrl/outbound-items" -Headers $authHeader -Body @{
    outbound_order_id = $created.outboundOrderId
    product_id = $ProductId
    lot_id = $LotId
    qty = $OutboundQty
    box_type = "BOX"
    box_count = 1
    remark = "integration-flow outbound item"
  }
  Assert-Ok -Response $outboundItem -Step "outbound-item-create"
  $created.outboundItemId = [int]$outboundItem.data.id

  $events = Invoke-Api -Method GET -Url "$BaseUrl/service-events?outbound_order_id=$($created.outboundOrderId)" -Headers $authHeader
  Assert-Ok -Response $events -Step "service-events"
  $eventsCount = @($events.data).Count
  if ($eventsCount -lt 1) {
    throw "[service-events] expected at least 1 event, got $eventsCount"
  }
  Write-Host "SERVICE_EVENTS_COUNT_AFTER_OUTBOUND=$eventsCount"

  # 3) Settlement batch generate
  $settlement = Invoke-Api -Method POST -Url "$BaseUrl/settlement-batches/generate" -Headers $authHeader -Body @{
    client_id = $ClientId
    billing_month = $billingMonth
    created_by = $UserId
    is_provisional = 1
  }
  Assert-Ok -Response $settlement -Step "settlement-generate"
  $batchId = [int]$settlement.data.batch.id
  Write-Host "SETTLEMENT_GENERATE_OK=$($settlement.ok) BATCH_ID=$batchId"

  # 4) Invoice issue
  $invoice = Invoke-Api -Method POST -Url "$BaseUrl/invoices/issue" -Headers $authHeader -Body @{
    settlement_batch_id = $batchId
    issue_date = $today
    due_date = $dueDate
    recipient_email = "billing+$ts@example.com"
    created_by = $UserId
  }
  Assert-Ok -Response $invoice -Step "invoice-issue"
  $invoiceId = [int]$invoice.data.invoice.id
  Write-Host "INVOICE_ISSUE_OK=$($invoice.ok) INVOICE_ID=$invoiceId REUSED=$($invoice.data.reused)"

  # 5) Close -> reopen request -> approve
  $close = Invoke-Api -Method POST -Url "$BaseUrl/settlement-batches/$batchId/close" -Headers $authHeader -Body @{
    closed_by = $UserId
    reason = "integration-flow close"
  }
  Assert-Ok -Response $close -Step "settlement-close"
  Write-Host "BATCH_CLOSE_OK=$($close.ok)"

  $reopenReq = Invoke-Api -Method POST -Url "$BaseUrl/settlement-batches/$batchId/reopen-requests" -Headers $authHeader -Body @{
    requested_by = $UserId
    reason = "integration-flow reopen request"
  }
  Assert-Ok -Response $reopenReq -Step "reopen-request"
  $reopenRequestId = [int]$reopenReq.data.id
  Write-Host "REOPEN_REQUEST_OK=$($reopenReq.ok) REQUEST_ID=$reopenRequestId"

  $approve = Invoke-Api -Method POST -Url "$BaseUrl/settlement-reopen-requests/$reopenRequestId/approve" -Headers $authHeader -Body @{
    approved_by = $UserId
    reason = "integration-flow reopen approve"
  }
  Assert-Ok -Response $approve -Step "reopen-approve"
  Write-Host "REOPEN_APPROVE_OK=$($approve.ok)"

  $batchAfter = Invoke-Api -Method GET -Url "$BaseUrl/settlement-batches/$batchId" -Headers $authHeader
  Assert-Ok -Response $batchAfter -Step "settlement-batch-get"
  $batchStatus = [string]$batchAfter.data.batch.status
  Write-Host "BATCH_STATUS_AFTER_APPROVE=$batchStatus"

  if ($batchStatus -ne "reviewed") {
    throw "[settlement-batch-get] expected status=reviewed, got $batchStatus"
  }

  Write-Host "FLOW_OK=True"
} finally {
  # Cleanup in reverse order for stock consistency
  if ($created.outboundItemId) {
    try { $null = Invoke-Api -Method DELETE -Url "$BaseUrl/outbound-items/$($created.outboundItemId)" -Headers $authHeader } catch { $cleanupErrors += "outbound-item delete failed: $($_.Exception.Message)" }
  }
  if ($created.outboundOrderId) {
    try { $null = Invoke-Api -Method DELETE -Url "$BaseUrl/outbound-orders/$($created.outboundOrderId)" -Headers $authHeader } catch { $cleanupErrors += "outbound-order delete failed: $($_.Exception.Message)" }
  }
  if ($created.inboundItemId) {
    try { $null = Invoke-Api -Method DELETE -Url "$BaseUrl/inbound-items/$($created.inboundItemId)" -Headers $authHeader } catch { $cleanupErrors += "inbound-item delete failed: $($_.Exception.Message)" }
  }
  if ($created.inboundOrderId) {
    try { $null = Invoke-Api -Method DELETE -Url "$BaseUrl/inbound-orders/$($created.inboundOrderId)" -Headers $authHeader } catch { $cleanupErrors += "inbound-order delete failed: $($_.Exception.Message)" }
  }

  if ($serverProcess -and -not $serverProcess.HasExited) {
    try { Stop-Process -Id $serverProcess.Id -Force } catch {}
  }

  if ($cleanupErrors.Count -eq 0) {
    Write-Host "CLEANUP_OK=True"
  } else {
    Write-Host "CLEANUP_OK=False"
    $cleanupErrors | ForEach-Object { Write-Host "CLEANUP_ERROR=$_" }
  }
}
