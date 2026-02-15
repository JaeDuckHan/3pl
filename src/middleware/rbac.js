function canWrite(role) {
  return ["admin", "manager", "warehouse"].includes(role);
}

function enforceWriteAccess(req, res, next) {
  if (req.method === "GET") {
    return next();
  }

  const role = req.user && req.user.role;
  if (!canWrite(role)) {
    return res.status(403).json({
      ok: false,
      code: "FORBIDDEN",
      message: "Insufficient role for write operation"
    });
  }

  return next();
}

module.exports = { enforceWriteAccess };
