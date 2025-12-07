const TABLES = {
  modules: "res_modules",
  permissions: "res_permissions",
  rolePermissions: "res_role_permissions",
  roles: "res_roles",
};

const MODULES = [
  {
    module_key: "orders",
    module_name: "Orders",
    description: "Manage order lifecycle, fulfillment, payments and status.",
  },
  {
    module_key: "files",
    module_name: "File Manager",
    description: "Manage folders, digital assets, uploads and file metadata.",
  },
];

const ACTIONS = ["list", "view", "edit", "delete"];

async function upsertModule(trx, module) {
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
    return existing.module_id;
  }

  const [insertId] = await trx(TABLES.modules).insert({
    module_key: module.module_key,
    module_name: module.module_name,
    description: module.description,
    is_system: true,
  });
  return insertId;
}

async function upsertPermission(trx, moduleId, moduleName, action) {
  const existing = await trx(TABLES.permissions)
    .select("permission_id")
    .where({
      module_id: moduleId,
      permission_name: action,
    })
    .first();

  if (existing) {
    await trx(TABLES.permissions)
      .where("permission_id", existing.permission_id)
      .update({
        description: `${action} access for ${moduleName}`,
      });
    return existing.permission_id;
  }

  const [insertId] = await trx(TABLES.permissions).insert({
    module_id: moduleId,
    permission_name: action,
    description: `${action} access for ${moduleName}`,
  });
  return insertId;
}

async function ensureSuperAdminPermissions(trx, permissionIds) {
  if (!permissionIds || permissionIds.length === 0) {
    return;
  }

  const superAdmin = await trx(TABLES.roles)
    .select("role_id")
    .where("role_key", "super_admin")
    .first();

  if (!superAdmin) {
    return;
  }

  for (const permissionId of permissionIds) {
    const existing = await trx(TABLES.rolePermissions)
      .where({
        role_id: superAdmin.role_id,
        permission_id: permissionId,
      })
      .first();

    if (!existing) {
      await trx(TABLES.rolePermissions).insert({
        role_id: superAdmin.role_id,
        permission_id: permissionId,
      });
    }
  }
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const permissionIdsToAttach = [];

    for (const module of MODULES) {
      const moduleId = await upsertModule(trx, module);

      for (const action of ACTIONS) {
        const permissionId = await upsertPermission(
          trx,
          moduleId,
          module.module_name,
          action
        );
        permissionIdsToAttach.push(permissionId);
      }
    }

    await ensureSuperAdminPermissions(trx, permissionIdsToAttach);
  });
};

exports.down = async function down(knex) {
  await knex.transaction(async (trx) => {
    const moduleRows = await trx(TABLES.modules)
      .select("module_id")
      .whereIn(
        "module_key",
        MODULES.map((module) => module.module_key)
      );

    if (!moduleRows || moduleRows.length === 0) {
      return;
    }

    const moduleIds = moduleRows.map((row) => row.module_id);

    await trx(TABLES.rolePermissions)
      .whereIn("permission_id", function () {
        this.select("permission_id")
          .from(TABLES.permissions)
          .whereIn("module_id", moduleIds);
      })
      .del();

    await trx(TABLES.permissions).whereIn("module_id", moduleIds).del();

    await trx(TABLES.modules)
      .whereIn("module_id", moduleIds)
      .andWhere("is_system", true)
      .del();
  });
};





