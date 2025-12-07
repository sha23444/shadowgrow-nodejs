const { pool } = require("../../config/database");

async function getMenus(req, res) {
  const { location } = req.query;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM menu_items WHERE menu_type = ? ORDER BY level, sort_order, id",
      [location]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "No menu items found for the given menu type" });
    }

    const menuTree = await buildMenuTree(rows);
    res.status(200).json(menuTree);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch menu items by type" });
  }
}

async function buildMenuTree(items, parentId = null) {
  const children = items.filter(item => item.parent_id === parentId);

  return Promise.all(
    children.map(async (item) => ({
      id: item.id,
      label: item.label,
      url: item.url,
      level: item.level,
      isOpen: !!item.is_open,
      menuType: item.menu_type,
      children: await buildMenuTree(items, item.id),
    }))
  );
}


module.exports = {
  getMenus,
};
