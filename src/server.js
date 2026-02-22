const express = require("express");
const dotenv = require("dotenv");
const swaggerUi = require("swagger-ui-express");
const { pingDb } = require("./db");
const { authenticateToken } = require("./middleware/auth");
const { enforceWriteAccess } = require("./middleware/rbac");
const authRouter = require("./routes/auth");
const productsRouter = require("./routes/products");
const productLotsRouter = require("./routes/productLots");
const warehousesRouter = require("./routes/warehouses");
const clientsRouter = require("./routes/clients");
const inboundOrdersRouter = require("./routes/inboundOrders");
const inboundItemsRouter = require("./routes/inboundItems");
const outboundOrdersRouter = require("./routes/outboundOrders");
const outboundItemsRouter = require("./routes/outboundItems");
const outboundBoxesRouter = require("./routes/outboundBoxes");
const returnOrdersRouter = require("./routes/returnOrders");
const returnItemsRouter = require("./routes/returnItems");
const stocksRouter = require("./routes/stocks");
const serviceEventsRouter = require("./routes/serviceEvents");
const settlementsRouter = require("./routes/settlements");
const billingEngineRouter = require("./routes/billingEngine");
const { router: dashboardRouter } = require("./routes/dashboard");
const { startStorageSnapshotSchedule } = require("./jobs/storageSnapshots");
const openapi = require("./openapi.json");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3100);
app.use(express.json());
app.use("/auth", authRouter);

function isPublicPath(pathname) {
  return (
    pathname === "/health" ||
    pathname === "/health/db" ||
    pathname === "/auth/login" ||
    pathname === "/auth/login/" ||
    pathname.startsWith("/docs")
  );
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "wms-api"
  });
});

app.get("/health/db", async (_req, res) => {
  try {
    const result = await pingDb();
    res.json({
      ok: true,
      db: result.db,
      serverTime: result.server_time
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Database connection failed",
      error: error.message
    });
  }
});

app.use((req, res, next) => {
  if (isPublicPath(req.path)) {
    return next();
  }
  return authenticateToken(req, res, next);
});

app.use((req, res, next) => {
  if (isPublicPath(req.path)) {
    return next();
  }
  return enforceWriteAccess(req, res, next);
});

app.use("/products", productsRouter);
app.use("/product-lots", productLotsRouter);
app.use("/warehouses", warehousesRouter);
app.use("/clients", clientsRouter);
app.use("/inbound-orders", inboundOrdersRouter);
app.use("/inbound-items", inboundItemsRouter);
app.use("/outbound-orders", outboundOrdersRouter);
app.use("/outbound-orders", outboundBoxesRouter);
app.use("/outbound-items", outboundItemsRouter);
app.use("/return-orders", returnOrdersRouter);
app.use("/return-items", returnItemsRouter);
app.use("/", stocksRouter);
app.use("/", serviceEventsRouter);
app.use("/", settlementsRouter);
app.use("/", billingEngineRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    code: "NOT_FOUND",
    message: "Route not found"
  });
});

app.use((error, _req, res, _next) => {
  res.status(500).json({
    ok: false,
    code: "INTERNAL_ERROR",
    message: error.message || "Internal server error"
  });
});

app.listen(port, () => {
  startStorageSnapshotSchedule();
  console.log(`wms-api listening on http://localhost:${port}`);
});
