param(
  [string]$BaseUrl = "http://127.0.0.1:3100"
)

$ErrorActionPreference = "Stop"
$mysql = "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe"

function Assert-True($cond, [string]$msg) {
  if (-not $cond) { throw "ASSERT_FAIL: $msg" }
}

function Step([int]$n, [string]$msg) {
  Write-Host "[$n/10] $msg"
}

$server = Start-Process -FilePath cmd.exe -ArgumentList '/c','npm run dev' -WorkingDirectory (Join-Path $PSScriptRoot '..') -PassThru
try {
  Start-Sleep -Seconds 4
  $health = curl.exe -s -o NUL -w "%{http_code}" "$BaseUrl/health"
  Assert-True ($health -eq "200") "API not healthy"

  Step 1 "Login"
  $login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType "application/json" -Body (@{ email="admin.demo@example.com"; password="1234" } | ConvertTo-Json)
  $token = $login.data.token
  $h = @{ Authorization = "Bearer $token" }

  Step 2 "Resolve/create test client"
  $clientId = & $mysql -h 127.0.0.1 -P 3306 -u root -p1234 -N -B -D wms_test -e "SELECT id FROM clients WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1"
  if ([string]::IsNullOrWhiteSpace($clientId)) {
    $created = Invoke-RestMethod -Method Post -Uri "$BaseUrl/clients" -Headers $h -ContentType "application/json" -Body (@{ client_code="BILL10"; name_kr="Billing 10-step"; status="active" } | ConvertTo-Json)
    $clientId = [string]$created.data.id
  }

  Step 3 "Create service rates (admin gate path)"
  $services = @(
    @{ service_code='TH_SHIPPING'; service_name='Thailand Shipping'; billing_unit='ORDER'; pricing_policy='THB_BASED'; default_currency='THB'; default_rate=120; status='active' },
    @{ service_code='TH_BOX'; service_name='Thailand Box'; billing_unit='BOX'; pricing_policy='THB_BASED'; default_currency='THB'; default_rate=8; status='active' },
    @{ service_code='OUTBOUND_FEE'; service_name='Outbound Fee'; billing_unit='ORDER'; pricing_policy='KRW_FIXED'; default_currency='KRW'; default_rate=3500; status='active' }
  )
  foreach($s in $services){
    try { Invoke-RestMethod -Method Post -Uri "$BaseUrl/billing/settings/service-catalog" -Headers $h -ContentType "application/json" -Body ($s | ConvertTo-Json) | Out-Null }
    catch { if (-not ($_.Exception.Message -like '*409*')) { throw } }
  }

  Step 4 "Create FX rate + verify list has used count field"
  try { Invoke-RestMethod -Method Post -Uri "$BaseUrl/billing/settings/exchange-rates" -Headers $h -ContentType "application/json" -Body (@{ rate_date='2026-02-20'; rate=39.125; source='manual'; locked=0; status='active' } | ConvertTo-Json) | Out-Null }
  catch { if (-not ($_.Exception.Message -like '*409*')) { throw } }
  $fxList = Invoke-RestMethod -Method Get -Uri "$BaseUrl/billing/settings/exchange-rates?month=2026-02" -Headers $h
  Assert-True ($fxList.data.Count -ge 1) "FX list empty"
  Assert-True ($null -ne $fxList.data[0].used_invoice_count) "FX used_invoice_count missing"

  Step 5 "Seed billing events"
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/billing/events/sample" -Headers $h -ContentType "application/json" -Body (@{ client_id=[int]$clientId; invoice_month='2026-02' } | ConvertTo-Json) | Out-Null

  Step 6 "Verify billing events filters + CSV endpoint"
  $events = Invoke-RestMethod -Method Get -Uri "$BaseUrl/billing/events?invoice_month=2026-02&client_id=$clientId&status=PENDING" -Headers $h
  Assert-True ($events.data.Count -ge 3) "Expected seeded pending events"
  $csvCode = curl.exe -s -o NUL -w "%{http_code}" -H "Authorization: Bearer $token" "$BaseUrl/billing/events/export.csv?invoice_month=2026-02&client_id=$clientId"
  Assert-True ($csvCode -eq "200") "CSV export failed"

  Step 7 "Generate invoice draft and validate TRUNC100 + VAT_7"
  $gen = Invoke-RestMethod -Method Post -Uri "$BaseUrl/billing/invoices/generate" -Headers $h -ContentType "application/json" -Body (@{ client_id=[int]$clientId; invoice_month='2026-02'; invoice_date='2026-02-20'; regenerate_draft=1 } | ConvertTo-Json)
  $invoiceId = [int]$gen.data.invoice.id
  $detail = Invoke-RestMethod -Method Get -Uri "$BaseUrl/billing/invoices/$invoiceId" -Headers $h
  $vat = $detail.data.items | Where-Object { $_.service_code -eq "VAT_7" }
  Assert-True ($null -ne $vat) "VAT_7 line missing"
  $mods = $detail.data.items | ForEach-Object { [int]([decimal]$_.amount_krw) % 100 }
  Assert-True (($mods | Where-Object { $_ -ne 0 }).Count -eq 0) "TRUNC100 failed in invoice items"

  Step 8 "Issue invoice and verify regeneration blocked"
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/billing/invoices/$invoiceId/issue" -Headers $h | Out-Null
  try {
    Invoke-RestMethod -Method Post -Uri "$BaseUrl/billing/invoices/generate" -Headers $h -ContentType "application/json" -Body (@{ client_id=[int]$clientId; invoice_month='2026-02'; invoice_date='2026-02-20'; regenerate_draft=1 } | ConvertTo-Json) | Out-Null
    throw "Generation should have been blocked"
  } catch {
    Assert-True ($_.Exception.Message -like '*400*') "Expected blocked generation after issue"
  }

  Step 9 "Admin duplicate issued invoice"
  $dup = Invoke-RestMethod -Method Post -Uri "$BaseUrl/billing/invoices/$invoiceId/duplicate-admin" -Headers $h
  Assert-True ($dup.data.status -eq "draft") "Duplicated invoice should be draft"

  Step 10 "Mark original issued invoice paid + events remain invoiced"
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/billing/invoices/$invoiceId/mark-paid" -Headers $h | Out-Null
  $stats = & $mysql -h 127.0.0.1 -P 3306 -u root -p1234 -N -B -D wms_test -e "SELECT status, COUNT(*) FROM billing_events WHERE client_id=$clientId AND DATE_FORMAT(event_date,'%Y-%m')='2026-02' AND deleted_at IS NULL GROUP BY status"
  Assert-True ($stats -match "INVOICED") "Expected invoiced events after generation"

  Write-Host "PASS: Billing production 10-step scenario"
}
finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }
}
