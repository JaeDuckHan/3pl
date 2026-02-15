const mysql = require("mysql2/promise");

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "wms_test",
      waitForConnections: true,
      connectionLimit: 10
    });
  }

  return pool;
}

async function pingDb() {
  const [rows] = await getPool().query(
    "SELECT DATABASE() AS db, NOW() AS server_time"
  );
  return rows[0];
}

module.exports = {
  getPool,
  pingDb
};
