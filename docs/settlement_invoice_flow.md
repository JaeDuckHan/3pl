# Settlement + Invoice Integrated Flow

One-shot integration test flow:

1. Login
2. Prepare stock with inbound
3. Outbound (auto create `service_events`)
4. Settlement generate
5. Invoice issue
6. Settlement close
7. Reopen request
8. Reopen approve

## Prerequisites

- `.env` configured in `wms-api`
- Seed applied: `wms-api/sql/seed_master_min.sql`
- Demo login:
  - `admin.demo@example.com`
  - `1234`

Default script IDs (seed baseline):

- `ClientId` and `UserId` are auto-resolved from `GET /auth/me` when omitted
- `WarehouseId=201`
- `ProductId=401`
- `LotId=501`

If your DB IDs differ, pass parameters when running.
`WarehouseId`, `ProductId`, `LotId` can be auto-resolved only when set to `0`.

## Run

```powershell
cd D:\_작업폴더_codex\wms-api
powershell -ExecutionPolicy Bypass -File .\scripts\run_settlement_invoice_flow.ps1
```

When API is not running, script can auto-start `node src/server.js` and stop it after run.

## Optional Parameters

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_settlement_invoice_flow.ps1 `
  -BaseUrl http://localhost:3010 `
  -ClientId 101 -UserId 1002 `
  -WarehouseId 0 -WarehouseCode WH-DEMO-001 `
  -ProductId 0 -ProductBarcodeFull 880000000001-TH `
  -LotId 0 -LotNo LOT-DEMO-001 `
  -InboundQty 30 -OutboundQty 10
```

## Expected Output Summary

- `LOGIN_OK=True`
- `SERVICE_EVENTS_COUNT_AFTER_OUTBOUND >= 1`
- `SETTLEMENT_GENERATE_OK=True`
- `INVOICE_ISSUE_OK=True`
- `BATCH_CLOSE_OK=True`
- `REOPEN_REQUEST_OK=True`
- `REOPEN_APPROVE_OK=True`
- `BATCH_STATUS_AFTER_APPROVE=reviewed`
- `FLOW_OK=True`

## CI Failure Check Order (5-10 lines)

1. Open failed run from `.github/workflows/settlement-e2e.yml` and identify the first failed step.
2. Download Actions artifact `settlement-e2e-logs`.
3. Check `/tmp/wms-api.log` for server start, DB connection, and route errors.
4. Check `/tmp/settlement-e2e.log` for `=== ATTEMPT x/3 ===` and `E2E_RESULT=FAIL`.
5. Reproduce locally: `npm run test:e2e:settlement`.
6. Run regression set: `npm run test:e2e:reopen-reject`, `npm run test:e2e:invoice-reuse`, `npm run test:e2e:insufficient-stock`.
7. For deterministic rerun, keep API up and run scripts with `-StartServerIfDown:$false -BaseUrl http://localhost:3100`.
