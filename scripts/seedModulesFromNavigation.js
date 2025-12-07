/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });
const { pool } = require("../config/database");

function parseStringLiteral(raw) {
  if (!raw) return "";
  let value = raw.trim();
  if (value.endsWith(",")) {
    value = value.slice(0, -1);
  }
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("`") && value.endsWith("`"))
  ) {
    value = value.slice(1, -1);
  }
  return value.trim();
}

function sanitizeModuleKey(url, fallbackTitle) {
  if (!url) {
    return fallbackTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 100);
  }
  const normalized = url
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (normalized.length === 0) {
    return fallbackTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 100);
  }
  return normalized.slice(0, 100);
}

function parseNavigation() {
  const navPath = path.resolve(
    __dirname,
    "../../admin/src/app/config/navigation.ts"
  );
  const content = fs.readFileSync(navPath, "utf8");
  const lines = content.split("\n");
  const modulesMap = new Map();

  let currentItem = {};

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("id: ")) {
      currentItem = {};
    }
    if (trimmed.startsWith("title: ")) {
      currentItem.title = parseStringLiteral(trimmed.split(":").slice(1).join(":"));
    }
    if (trimmed.startsWith("description: ")) {
      currentItem.description = parseStringLiteral(
        trimmed.split(":").slice(1).join(":")
      );
    }
    if (trimmed.startsWith("url: ")) {
      currentItem.url = parseStringLiteral(trimmed.split(":").slice(1).join(":"));
      if (!currentItem.title) {
        currentItem.title = currentItem.url || "Untitled";
      }
      const moduleKey = sanitizeModuleKey(currentItem.url, currentItem.title);
      if (!modulesMap.has(moduleKey)) {
        modulesMap.set(moduleKey, {
          module_key: moduleKey,
          module_name: currentItem.title,
          description:
            currentItem.description ||
            `Access controls for ${currentItem.title}`,
        });
      }
      currentItem = {};
    }
  });

  return Array.from(modulesMap.values());
}

async function seedModules() {
  const databaseName = process.env.DB_DATABASE;
  if (!databaseName) {
    throw new Error(
      "DB_DATABASE environment variable is not set. Please configure database credentials before running the seed."
    );
  }

  const modules = parseNavigation();
  console.log(`Discovered ${modules.length} navigation modules.`);

  await pool.execute(`USE \`${databaseName}\``);

  const [[superAdminRow]] = await pool.execute(
    "SELECT role_id FROM res_roles WHERE role_key = ? LIMIT 1",
    ["super_admin"]
  );
  const superAdminRoleId = superAdminRow ? superAdminRow.role_id : null;

  let modulesCreated = 0;
  let permissionsCreated = 0;

  for (const module of modules) {
    const { module_key: moduleKey, module_name: moduleName, description } = module;
    await pool.execute(
      `INSERT INTO res_modules (module_key, module_name, description, is_system)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         module_name = VALUES(module_name),
         description = VALUES(description),
         is_system = VALUES(is_system)`,
      [moduleKey, moduleName, description, 0]
    );

    const [[moduleRow]] = await pool.execute(
      "SELECT module_id FROM res_modules WHERE module_key = ? LIMIT 1",
      [moduleKey]
    );
    const moduleId = moduleRow.module_id;
    modulesCreated += 1;

    const actions = ["list", "view", "edit", "delete"];
    for (const action of actions) {
      await pool.execute(
        `INSERT INTO res_permissions (module_id, permission_name, description)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           description = VALUES(description)`,
        [moduleId, action, `${action} access for ${moduleName}`]
      );
      const [[permissionRow]] = await pool.execute(
        `SELECT permission_id
           FROM res_permissions
          WHERE module_id = ?
            AND permission_name = ?
          LIMIT 1`,
        [moduleId, action]
      );
      permissionsCreated += 1;
      if (superAdminRoleId) {
        await pool.execute(
          `INSERT IGNORE INTO res_role_permissions (role_id, permission_id)
           VALUES (?, ?)`,
          [superAdminRoleId, permissionRow.permission_id]
        );
      }
    }
  }

  console.log(
    `Seeded ${modulesCreated} modules and ensured permissions (actions x4 each).`
  );
  if (superAdminRoleId) {
    console.log("Super admin role updated with new permissions.");
  } else {
    console.warn("Super admin role not found. Skipped assigning permissions.");
  }
}

seedModules()
  .catch((error) => {
    console.error("Failed to seed modules from navigation:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (err) {
      console.error("Failed to close DB pool:", err);
    }
  });


