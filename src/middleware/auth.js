const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;

  if (!token) {
    return res.status(401).json({
      ok: false,
      code: "UNAUTHORIZED",
      message: "Missing Bearer token"
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    req.user = payload;
    next();
  } catch (_error) {
    return res.status(401).json({
      ok: false,
      code: "UNAUTHORIZED",
      message: "Invalid or expired token"
    });
  }
}

module.exports = { authenticateToken };
