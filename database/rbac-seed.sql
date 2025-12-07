-- Seed additional modules and permissions for Admin RBAC

INSERT INTO res_modules (module_id, module_key, module_name, description, is_system)
VALUES
  (3, 'orders', 'Orders', 'Manage order lifecycle, fulfillment and status.', 1),
  (4, 'users', 'Users', 'Manage customer accounts, authentication and profiles.', 1)
ON DUPLICATE KEY UPDATE
  module_name = VALUES(module_name),
  description = VALUES(description),
  is_system = VALUES(is_system);

INSERT INTO res_permissions (permission_id, module_id, permission_name, description)
VALUES
  -- Orders permissions
  (9, 3, 'list', 'list access for Orders'),
  (10, 3, 'view', 'view access for Orders'),
  (11, 3, 'edit', 'edit access for Orders'),
  (12, 3, 'delete', 'delete access for Orders'),
  -- Users permissions
  (13, 4, 'list', 'list access for Users'),
  (14, 4, 'view', 'view access for Users'),
  (15, 4, 'edit', 'edit access for Users'),
  (16, 4, 'delete', 'delete access for Users')
ON DUPLICATE KEY UPDATE
  description = VALUES(description);


