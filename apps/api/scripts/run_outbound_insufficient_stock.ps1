param(
  [string]$BaseUrl = "http://localhost:3100",
  [string]$Email = "admin.demo@example.com",
  [string]$Password = "1234",
  [int]$ClientId = 101,
  [int]$WarehouseId = 201,
  [int]$UserId = 1002,
  [int]$ProductId = 401,
  [int]$LotId = 501,
  [string]$LotNo = "LOT-DEMO-001",
  [int]$OutboundQty = 999999,
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

function Select-IdByField($rows, $fieldName, $expectedValue) {
  if (-not $rows) { return $null }
  foreach ($row in $rows) {
    if ($row.$fieldName -eq $expectedValue) { return [int]$row.id }
  }
  return $null
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

  $login = Invoke-Api -Method POST -Url "$BaseUrl/auth/login" -Body @{ email=$Email; password=$Password }
  if (-not $login.ok) { throw "login failed" }
  $authHeader = @{ Authorization = "Bearer $($login.data.token)" }
  Write-Host "LOGIN_OK=$($login.ok)"

  if ($LotId -le 0) {
    $lotList = Invoke-Api -Method GET -Url "$BaseUrl/product-lots?product_id=$ProductId&status=active" -Headers $authHeader
    if (-not $lotList.ok) { throw "[product-lots-list] ok=false" }
    $LotId = Select-IdByField @($lotList.data) "lot_no" $LotNo
    if (-not $LotId -and @($lotList.data).Count -gt 0) {
      $LotId = [int]$lotList.data[0].id
    }
  }

  if ($LotId -le 0) {
    throw "[preflight] invalid LotId. Use -LotId explicitly or ensure active lot exists for product."
  }

  $ob = Invoke-Api -Method POST -Url "$BaseUrl/outbound-orders" -Headers $authHeader -Body @{
    outbound_no="OB-NS-$ts"; client_id=$ClientId; warehouse_id=$WarehouseId; order_date=$today; status="draft"; created_by=$UserId
  }
  if (-not $ob.ok) { throw "outbound order create failed" }
  $outboundOrderId = [int]$ob.data.id

  $failedAsExpected = $false
  try {
    $null = Invoke-Api -Method POST -Url "$BaseUrl/outbound-items" -Headers $authHeader -Body @{
      outbound_order_id=$outboundOrderId; product_id=$ProductId; lot_id=$LotId; qty=$OutboundQty; box_type="BOX"; box_count=1; remark="insufficient stock case"
    }
  } catch {
    $json = $_.ErrorDetails.Message
    if (-not $json) { throw }
    $errObj = $json | ConvertFrom-Json
    if ($errObj.code -eq "INSUFFICIENT_STOCK") {
      $failedAsExpected = $true
      Write-Host "INSUFFICIENT_STOCK_OK=True"
    } else {
      throw "expected INSUFFICIENT_STOCK, got code=$($errObj.code) message=$($errObj.message)"
    }
  }

  if (-not $failedAsExpected) {
    throw "expected outbound-items to fail with INSUFFICIENT_STOCK"
  }

  Write-Host "FLOW_OK=True"
} finally {
  if ($outboundOrderId) {
    try { $null = Invoke-Api -Method DELETE -Url "$BaseUrl/outbound-orders/$outboundOrderId" -Headers $authHeader } catch {}
  }
  if ($serverProcess -and -not $serverProcess.HasExited) { try { Stop-Process -Id $serverProcess.Id -Force } catch {} }
}
