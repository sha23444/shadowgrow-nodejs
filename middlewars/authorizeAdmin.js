const normalize = (permissions) => {
  if (!permissions) return [];
  if (typeof permissions === "string") return [permissions];
  if (Array.isArray(permissions)) return permissions.filter(Boolean);
  return [];
};

const buildPermissionKey = (moduleKey, action) =>
  `${moduleKey}:${action}`.toLowerCase();

function authorizeAdmin(requiredPermissions) {
  const normalizedRequired = normalize(requiredPermissions).map((perm) =>
    perm.toLowerCase()
  );

  return (req, res, next) => {
    const admin = req.admin || req.user;
    if (!admin) {
      return res.status(500).json({
        error: "Admin context missing from request.",
      });
    }

    if (admin.isSuperAdmin) {
      return next();
    }

    const assigned = new Set(
      (admin.permissions || []).map((perm) => (perm || "").toLowerCase())
    );

    const missing = normalizedRequired.filter((perm) => !assigned.has(perm));

    if (missing.length === 0) {
      return next();
    }

    return res.status(403).json({
      error: "Forbidden: insufficient permissions.",
      missingPermissions: missing,
    });
  };
}

module.exports = {
  authorizeAdmin,
  buildPermissionKey,
};


