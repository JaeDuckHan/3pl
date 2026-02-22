# wms-api

Minimal API server to validate `wms_test` database connectivity.

## 1) Setup

```powershell
cd D:\_?묒뾽?대뜑_codex\wms-api
copy .env.example .env
npm install
```

## 2) Run

```powershell
npm start
```

## 3) Test

```powershell
curl http://localhost:3100/health
curl http://localhost:3100/health/db
```

If `/health/db` returns `ok: true`, the API is connected to MySQL.

## Swagger UI

Open in browser:

```text
http://localhost:3100/docs
```

Use `Try it out` in Swagger UI to test `POST/PUT/DELETE` endpoints from the web.

## Integration Test Script

End-to-end one-shot flow:

- `login -> outbound -> settlement -> invoice -> close/reopen`

Run:

```powershell
cd D:\_?묒뾽?대뜑_codex\wms-api
powershell -ExecutionPolicy Bypass -File .\scripts\run_settlement_invoice_flow.ps1
# or
npm run test:e2e:settlement
npm run test:e2e:reopen-reject
npm run test:e2e:invoice-reuse
npm run test:e2e:insufficient-stock
npm run test:e2e:outbound-detail
npm run test:e2e:inbound-detail
```

Details and parameter options:

- `docs/settlement_invoice_flow.md`
- `ClientId/UserId` auto-resolve from login user, and `WarehouseId/ProductId/LotId` can auto-resolve from seed keys.
- CI PR gate workflow: `.github/workflows/settlement-e2e.yml`
- Regression scripts:
- `scripts/run_settlement_reopen_reject_flow.ps1`
- `scripts/run_invoice_reuse_flow.ps1`
- `scripts/run_outbound_insufficient_stock.ps1`
- `scripts/run_outbound_detail_flow.ps1`
- `scripts/run_inbound_detail_flow.ps1`

CI configuration (optional overrides):

- `secrets.CI_DB_PASSWORD`
- `secrets.CI_JWT_SECRET`
- `vars.WMS_API_PORT`
- `vars.CI_DB_HOST`
- `vars.CI_DB_PORT`
- `vars.CI_DB_USER`
- `vars.CI_DB_NAME`

## CI Failure Triage (Quick)

1. Open GitHub Actions run: `.github/workflows/settlement-e2e.yml` and check failed step first.
2. In run summary, download artifact `settlement-e2e-logs`.
3. Inspect server boot/runtime log: `/tmp/wms-api.log`.
4. Inspect flow retry log: `/tmp/settlement-e2e.log` (`ATTEMPT`, `E2E_RESULT` lines).
5. Inspect regression log bundle: `/tmp/regression-e2e.log`.
6. Reproduce full flow locally: `npm run test:e2e:settlement`.
7. Reproduce regressions locally: `npm run test:e2e:reopen-reject`, `npm run test:e2e:invoice-reuse`, `npm run test:e2e:insufficient-stock`, `npm run test:e2e:outbound-detail`, `npm run test:e2e:inbound-detail`.
8. If DB/init issue is suspected, rerun schema/seed then execute scripts with `-StartServerIfDown:$false -BaseUrl http://localhost:3100`.

## Auth (JWT)

1. Login:

```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin.demo@example.com",
  "password": "1234"
}
```

2. Copy `data.token` from response.
3. In Swagger UI, click `Authorize` and set:

```text
Bearer <your-token>
```

All CRUD endpoints require a Bearer token.

`GET /auth/me` returns the current user from token.
Current demo setup validates password with plain text in `users.password_hash` (dev-only).

## Role Access

- `GET` endpoints: any authenticated role
- `POST/PUT/DELETE`: `admin`, `manager`, `warehouse` only
- `client_viewer`: read-only (write requests return `403 FORBIDDEN`)

## 4) CRUD Endpoints

`products`
- `GET /products`
- `GET /products/:id`
- `POST /products`
- `PUT /products/:id`
- `DELETE /products/:id` (soft delete)

`product-lots` (read-only)
- `GET /product-lots`
- `GET /product-lots/:id`

`warehouses`
- `GET /warehouses`
- `GET /warehouses/:id`
- `POST /warehouses`
- `PUT /warehouses/:id`
- `DELETE /warehouses/:id` (soft delete)

`clients`
- `GET /clients`
- `GET /clients/:id`
- `POST /clients`
- `PUT /clients/:id`
- `DELETE /clients/:id` (soft delete)

`inbound-orders`
- `GET /inbound-orders`
- `GET /inbound-orders/:id`
- `POST /inbound-orders`
- `PUT /inbound-orders/:id`
- `DELETE /inbound-orders/:id` (soft delete)

`inbound-items`
- `GET /inbound-items`
- `GET /inbound-items/:id`
- `GET /inbound-items?inbound_order_id=:id`
- `POST /inbound-items`
- `PUT /inbound-items/:id`
- `DELETE /inbound-items/:id` (soft delete)

`outbound-orders`
- `GET /outbound-orders`
- `GET /outbound-orders/:id`
- `POST /outbound-orders`
- `PUT /outbound-orders/:id`
- `DELETE /outbound-orders/:id` (soft delete)

`outbound-items`
- `GET /outbound-items`
- `GET /outbound-items/:id`
- `GET /outbound-items?outbound_order_id=:id`
- `POST /outbound-items`
- `PUT /outbound-items/:id`
- `DELETE /outbound-items/:id` (soft delete)

`outbound-boxes`
- `GET /outbound-orders/:id/boxes`
- `POST /outbound-orders/:id/boxes`
- `PUT /outbound-orders/:id/boxes/:boxId`
- `DELETE /outbound-orders/:id/boxes/:boxId` (soft delete)

`stocks`
- `GET /stock-balances`
- `GET /stock-transactions`

`return-orders`
- `GET /return-orders`
- `GET /return-orders/:id`
- `POST /return-orders`
- `PUT /return-orders/:id`
- `DELETE /return-orders/:id` (soft delete)

`return-items`
- `GET /return-items`
- `GET /return-items/:id`
- `GET /return-items?return_order_id=:id`
- `POST /return-items`
- `PUT /return-items/:id`
- `DELETE /return-items/:id` (soft delete)

`settlement-event`
- `GET /service-events`

Outbound item create/update/delete automatically syncs `service_events` using active `price_policies`.

`settlement-batch`
- `POST /settlement-batches/generate`
- `GET /settlement-batches/:id`

`invoice`
- `POST /invoices/issue`
- `GET /invoices/:id`

`settlement close/reopen`
- `POST /settlement-batches/:id/close`
- `POST /settlement-batches/:id/reopen-requests`
- `GET /settlement-batches/:id/reopen-requests`
- `POST /settlement-reopen-requests/:id/approve`
- `POST /settlement-reopen-requests/:id/reject`
- `GET /settlement-batches/:id/reopen-logs`




