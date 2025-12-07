/**
 * Migration: Establish admin role-based access control (RBAC) infrastructure.
 *
 * Responsibilities:
 *  - Ensure the core RBAC tables/columns exist (roles, modules, permissions, junction table)
 *  - Track role assignment metadata on admins
 *  - Seed baseline modules, permissions and a super admin role
 */

const TABLES = {
  admins: "res_admins",
  roles: "res_roles",
  modules: "res_modules",
  permissions: "res_permissions",
  rolePermissions: "res_role_permissions",
};

const INDEXES = {
  rolesKey: "res_roles_role_key_unique",
  modulesKey: "res_modules_module_key_unique",
  permissionsUnique: "res_permissions_module_action_unique",
};

const FK_ADMIN_ROLE = "fk_res_admins_role";

const DEFAULT_MODULES = [
  {
    module_key: "admin_accounts",
    module_name: "Admin Accounts",
    description: "CRUD access to administrator accounts, security and status.",
  },
  {
    module_key: "admin_roles",
    module_name: "Admin Roles & Permissions",
    description: "Manage role definitions, permission assignments and RBAC policies.",
  },
];

const PERMISSION_ACTIONS = ["list", "view", "edit", "delete"];

const SUPER_ADMIN_ROLE = {
  role_key: "super_admin",
  role_name: "Super Admin",
  description: "System role with unrestricted access to all admin modules.",
};

function slugify(value, fallbackPrefix) {
  if (!value || !value.trim) {
    return `${fallbackPrefix || "item"}_${Date.now()}`;
  }
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 100);
}

async function ensureUniqueIndex(knex, tableName, columns, indexName) {
  const [rows] = await knex.raw("SHOW INDEXES FROM ?? WHERE Key_name = ?", [
    tableName,
    indexName,
  ]);
  if (!rows || rows.length === 0) {
    await knex.schema.alterTable(tableName, (table) => {
      table.unique(columns, indexName);
    });
  }
}

async function backfillSlugs(knex, options) {
  const {
    tableName,
    idColumn,
    nameColumn,
    slugColumn,
    fallbackPrefix,
  } = options;

  const rows = await knex(tableName).select(idColumn, nameColumn, slugColumn);
  const used = new Set(rows.map((row) => row[slugColumn]).filter(Boolean));

  for (const row of rows) {
    if (row[slugColumn]) continue;

    const base =
      slugify(row[nameColumn], fallbackPrefix) || `${fallbackPrefix || "item"}_${row[idColumn]}`;
    let candidate = base;
    let suffix = 1;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    await knex(tableName)
      .where(idColumn, row[idColumn])
      .update({ [slugColumn]: candidate });
  }
}

async function ensureRolesTable(knex) {
  const exists = await knex.schema.hasTable(TABLES.roles);
  if (!exists) {
    await knex.schema.createTable(TABLES.roles, (table) => {
      table.increments("role_id").primary();
      table.string("role_name", 255).notNullable();
      table.string("role_key", 100).notNullable();
      table.text("description").nullable();
      table.boolean("is_system").notNullable().defaultTo(false);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.unique(["role_key"], INDEXES.rolesKey);
    });
    return;
  }

  if (!(await knex.schema.hasColumn(TABLES.roles, "role_key"))) {
    await knex.schema.table(TABLES.roles, (table) => {
      table.string("role_key", 100).nullable();
    });
  }

  if (!(await knex.schema.hasColumn(TABLES.roles, "description"))) {
    await knex.schema.table(TABLES.roles, (table) => {
      table.text("description").nullable();
    });
  }

  if (!(await knex.schema.hasColumn(TABLES.roles, "is_system"))) {
    await knex.schema.table(TABLES.roles, (table) => {
      table.boolean("is_system").notNullable().defaultTo(false);
    });
  }

  await backfillSlugs(knex, {
    tableName: TABLES.roles,
    idColumn: "role_id",
    nameColumn: "role_name",
    slugColumn: "role_key",
    fallbackPrefix: "role",
  });

  await knex.schema.alterTable(TABLES.roles, (table) => {
    table.string("role_key", 100).notNullable().alter();
  });

  await ensureUniqueIndex(knex, TABLES.roles, ["role_key"], INDEXES.rolesKey);
}

async function ensureModulesTable(knex) {
  const exists = await knex.schema.hasTable(TABLES.modules);
  if (!exists) {
    await knex.schema.createTable(TABLES.modules, (table) => {
      table.increments("module_id").primary();
      table.string("module_key", 100).notNullable();
      table.string("module_name", 255).notNullable();
      table.text("description").nullable();
      table.boolean("is_system").notNullable().defaultTo(false);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.unique(["module_key"], INDEXES.modulesKey);
    });
    return;
  }

  if (!(await knex.schema.hasColumn(TABLES.modules, "module_key"))) {
    await knex.schema.table(TABLES.modules, (table) => {
      table.string("module_key", 100).nullable();
    });
  }

  if (!(await knex.schema.hasColumn(TABLES.modules, "description"))) {
    await knex.schema.table(TABLES.modules, (table) => {
      table.text("description").nullable();
    });
  }

  if (!(await knex.schema.hasColumn(TABLES.modules, "is_system"))) {
    await knex.schema.table(TABLES.modules, (table) => {
      table.boolean("is_system").notNullable().defaultTo(false);
    });
  }

  await backfillSlugs(knex, {
    tableName: TABLES.modules,
    idColumn: "module_id",
    nameColumn: "module_name",
    slugColumn: "module_key",
    fallbackPrefix: "module",
  });

  await knex.schema.alterTable(TABLES.modules, (table) => {
    table.string("module_key", 100).notNullable().alter();
  });

  await ensureUniqueIndex(knex, TABLES.modules, ["module_key"], INDEXES.modulesKey);
}

async function ensurePermissionsTable(knex) {
  const exists = await knex.schema.hasTable(TABLES.permissions);
  if (!exists) {
    await knex.schema.createTable(TABLES.permissions, (table) => {
      table.increments("permission_id").primary();
      table
        .integer("module_id")
        .unsigned()
        .notNullable()
        .references("module_id")
        .inTable(TABLES.modules)
        .onDelete("CASCADE");
      table.string("permission_name", 64).notNullable();
      table.text("description").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());
      table.unique(["module_id", "permission_name"], INDEXES.permissionsUnique);
    });
    return;
  }

  if (!(await knex.schema.hasColumn(TABLES.permissions, "permission_name"))) {
    await knex.schema.table(TABLES.permissions, (table) => {
      table.string("permission_name", 64).notNullable();
    });
  } else {
    await knex.schema.alterTable(TABLES.permissions, (table) => {
      table.string("permission_name", 64).notNullable().alter();
    });
  }

  if (!(await knex.schema.hasColumn(TABLES.permissions, "description"))) {
    await knex.schema.table(TABLES.permissions, (table) => {
      table.text("description").nullable();
    });
  }

  await ensureUniqueIndex(
    knex,
    TABLES.permissions,
    ["module_id", "permission_name"],
    INDEXES.permissionsUnique
  );
}

async function ensureRolePermissionsTable(knex) {
  const exists = await knex.schema.hasTable(TABLES.rolePermissions);
  if (!exists) {
    await knex.schema.createTable(TABLES.rolePermissions, (table) => {
      table
        .integer("role_id")
        .unsigned()
        .notNullable()
        .references("role_id")
        .inTable(TABLES.roles)
        .onDelete("CASCADE");
      table
        .integer("permission_id")
        .unsigned()
        .notNullable()
        .references("permission_id")
        .inTable(TABLES.permissions)
        .onDelete("CASCADE");
      table.primary(["role_id", "permission_id"], "pk_role_permission");
    });
  }
}

async function ensureAdminRoleColumns(knex) {
  const hasRoleId = await knex.schema.hasColumn(TABLES.admins, "role_id");
  if (!hasRoleId) {
    await knex.schema.table(TABLES.admins, (table) => {
      table.integer("role_id").nullable();
    });
  } else {
    await knex.raw(`ALTER TABLE ?? MODIFY COLUMN role_id INT(11) NULL`, [TABLES.admins]);
  }

  if (!(await knex.schema.hasColumn(TABLES.admins, "role_assigned_at"))) {
    await knex.schema.table(TABLES.admins, (table) => {
      table.timestamp("role_assigned_at").nullable();
    });
  }

  if (!(await knex.schema.hasColumn(TABLES.admins, "role_assigned_by"))) {
    await knex.schema.table(TABLES.admins, (table) => {
      table.string("role_assigned_by", 191).nullable();
    });
  }

  const [fkRows] = await knex.raw(
    "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1",
    [TABLES.admins, "role_id"]
  );
  if (!fkRows || fkRows.length === 0) {
    await knex.schema.alterTable(TABLES.admins, (table) => {
      table
        .foreign("role_id", FK_ADMIN_ROLE)
        .references("role_id")
        .inTable(TABLES.roles)
        .onDelete("SET NULL");
    });
  }
}

async function seedDefaultRbac(knex) {
  await knex.transaction(async (trx) => {
    // Seed core modules
    for (const module of DEFAULT_MODULES) {
      const existing = await trx(TABLES.modules)
        .select("module_id")
        .where("module_key", module.module_key)
        .first();
      if (existing) {
        await trx(TABLES.modules)
          .where("module_id", existing.module_id)
          .update({
            module_name: module.module_name,
            description: module.description,
            is_system: true,
          });
      } else {
        await trx(TABLES.modules).insert({
          module_key: module.module_key,
          module_name: module.module_name,
          description: module.description,
          is_system: true,
        });
      }
    }

    const moduleRows = await trx(TABLES.modules)
      .select("module_id", "module_key")
      .whereIn(
        "module_key",
        DEFAULT_MODULES.map((m) => m.module_key)
      );
    const moduleIdMap = moduleRows.reduce((map, row) => {
      map[row.module_key] = row.module_id;
      return map;
    }, {});

    // Seed permissions per module/action
    for (const module of DEFAULT_MODULES) {
      const moduleId = moduleIdMap[module.module_key];
      if (!moduleId) continue;
      for (const action of PERMISSION_ACTIONS) {
        const existingPermission = await trx(TABLES.permissions)
          .select("permission_id")
          .where({ module_id: moduleId, permission_name: action })
          .first();
        if (!existingPermission) {
          await trx(TABLES.permissions).insert({
            module_id: moduleId,
            permission_name: action,
            description: `${action} access for ${module.module_name}`,
          });
        }
      }
    }

    // Ensure super admin role exists
    let superRole = await trx(TABLES.roles)
      .select("role_id")
      .where("role_key", SUPER_ADMIN_ROLE.role_key)
      .first();

    let superRoleId;
    if (!superRole) {
      const [insertId] = await trx(TABLES.roles).insert({
        role_name: SUPER_ADMIN_ROLE.role_name,
        role_key: SUPER_ADMIN_ROLE.role_key,
        description: SUPER_ADMIN_ROLE.description,
        is_system: true,
      });
      superRoleId = insertId;
    } else {
      superRoleId = superRole.role_id;
      await trx(TABLES.roles)
        .where("role_id", superRoleId)
        .update({
          role_name: SUPER_ADMIN_ROLE.role_name,
          description: SUPER_ADMIN_ROLE.description,
          is_system: true,
        });
    }

    // Attach all permissions to super admin
    const allPermissionIds = await trx(TABLES.permissions).pluck("permission_id");
    if (superRoleId && allPermissionIds.length > 0) {
      const existing = await trx(TABLES.rolePermissions)
        .where("role_id", superRoleId)
        .pluck("permission_id");
      const missing = allPermissionIds.filter((id) => !existing.includes(id));
      if (missing.length > 0) {
        await trx(TABLES.rolePermissions).insert(
          missing.map((permissionId) => ({
            role_id: superRoleId,
            permission_id: permissionId,
          }))
        );
      }
    }

    // Assign super admin role to admins without a role
    if (superRoleId) {
      await trx(TABLES.admins)
        .whereNull("role_id")
        .update({
          role_id: superRoleId,
          role_assigned_at: trx.fn.now(),
          role_assigned_by: "system-migration",
        });
    }
  });
}

exports.up = async function up(knex) {
  await ensureRolesTable(knex);
  await ensureModulesTable(knex);
  await ensurePermissionsTable(knex);
  await ensureRolePermissionsTable(knex);
  await ensureAdminRoleColumns(knex);
  await seedDefaultRbac(knex);
};

async function removeSeededData(knex) {
  await knex.transaction(async (trx) => {
    const modules = await trx(TABLES.modules)
      .select("module_id")
      .whereIn(
        "module_key",
        DEFAULT_MODULES.map((m) => m.module_key)
      );
    const moduleIds = modules.map((m) => m.module_id);

    if (moduleIds.length > 0) {
      await trx(TABLES.rolePermissions)
        .whereIn("permission_id", function () {
          this.select("permission_id")
            .from(TABLES.permissions)
            .whereIn("module_id", moduleIds);
        })
        .del();
      await trx(TABLES.permissions).whereIn("module_id", moduleIds).del();
      await trx(TABLES.modules)
        .whereIn(
          "module_key",
          DEFAULT_MODULES.map((m) => m.module_key)
        )
        .andWhere("is_system", true)
        .del();
    }

    await trx(TABLES.roles)
      .where("role_key", SUPER_ADMIN_ROLE.role_key)
      .andWhere("is_system", true)
      .del();
  });
}

async function dropAdminRoleColumns(knex) {
  const [fkRows] = await knex.raw(
    "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1",
    [TABLES.admins, "role_id"]
  );
  if (fkRows && fkRows.length > 0) {
    await knex.schema.alterTable(TABLES.admins, (table) => {
      table.dropForeign("role_id", FK_ADMIN_ROLE);
    });
  }

  if (await knex.schema.hasColumn(TABLES.admins, "role_assigned_by")) {
    await knex.schema.table(TABLES.admins, (table) => {
      table.dropColumn("role_assigned_by");
    });
  }

  if (await knex.schema.hasColumn(TABLES.admins, "role_assigned_at")) {
    await knex.schema.table(TABLES.admins, (table) => {
      table.dropColumn("role_assigned_at");
    });
  }

  if (await knex.schema.hasColumn(TABLES.admins, "role_id")) {
    await knex.schema.table(TABLES.admins, (table) => {
      table.dropColumn("role_id");
    });
  }
}

exports.down = async function down(knex) {
  await removeSeededData(knex);
  await dropAdminRoleColumns(knex);
};

