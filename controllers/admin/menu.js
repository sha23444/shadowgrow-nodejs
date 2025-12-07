const { pool } = require("../../config/database");
const fs = require("fs");
const path = require("path");
const { PAGES } = require("../utils/constants");
const { clearMenuCache } = require("../../config/smart-cache");

// Recursive function to insert menu item and its children
async function insertMenuItem(connection, item, parentId = null, sortOrder = 0) {
  await connection.query(
    `INSERT INTO menu_items (id, label, url, level, parent_id, is_open, menu_type, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.label,
      item.url,
      item.level,
      parentId,
      item.isOpen ? 1 : 0,
      item.menuType,
      sortOrder
    ]
  );

  if (item.children && Array.isArray(item.children)) {
    for (let i = 0; i < item.children.length; i++) {
      const child = item.children[i];
      await insertMenuItem(connection, child, item.id, i); // Pass index as sortOrder
    }
  }
}

// Handler function to replace menu items
async function addMenuItems(req, res) {
  const menuItems = req.body.menuItems;
  const menuType = req.query.menuType;
  console.log('menuType:', menuType);
  console.log('menuItems:', menuItems);

  if (!menuItems) {
    return res.status(400).json({ error: 'menuItems is required' });
  }

  if (!Array.isArray(menuItems)) {
    return res.status(400).json({ error: 'Invalid payload format - menuItems must be an array' });
  }

  if (!menuType) {
    return res.status(400).json({ error: 'menuType is required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Delete existing items for this menuType, deleting children first by level DESC
    await connection.query(
      'DELETE FROM menu_items WHERE menu_type = ? ORDER BY level DESC',
      [menuType]
    );

    // Insert new menu items with correct sort order
    for (let i = 0; i < menuItems.length; i++) {
      const item = menuItems[i];
      await insertMenuItem(connection, item, null, i); // Pass root sortOrder here
    }

    await connection.commit();

    // Clear cache after updating menu
    await clearMenuCache();

    res.status(200).json({ message: 'Menu items replaced successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error replacing menu items:', error);
    res.status(500).json({ error: 'Error replacing menu items' });
  } finally {
    connection.release();
  }
}


// Function to build a tree structure from flat menu items
// This function recursively builds a tree structure from the flat menu items
// based on their parent-child relationships.

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


// Function to get menu items from the database

async function getMenuItems(req, res) {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM menu_items ORDER BY level, sort_order, id"
    );

    if (!rows || rows.length === 0) {
      return res.status(200).json([]);
    }

    const groupedByType = rows.reduce((acc, item) => {
      if (!acc[item.menu_type]) acc[item.menu_type] = [];
      acc[item.menu_type].push(item);
      return acc;
    }, {});

    const result = {};
    for (const menuType in groupedByType) {
      result[menuType] = await buildMenuTree(groupedByType[menuType]);
    }

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch menu items" });
  }
}

// get menu items by menu type

async function getMenuItemsByType(req, res) {
  const { menuType } = req.params;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM menu_items WHERE menu_type = ? ORDER BY level, sort_order, id",
      [menuType]
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


// get the pages to select the dropdown

async function getPages(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT title, slug FROM res_pages WHERE is_active = 1"
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "No pages found" });
    }


    res.status(200).json({
      data: [...PAGES, ...rows]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch pages" });
  }
}

async function getBlogs(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT title, slug FROM res_blogs WHERE status = 'published'"
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "No blogs found" });
    }

    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch blogs" });
  }
}

async function getThemePages(res) {
  const pages = [
    {
      "title": "Home",
      "url": "/"
    },
    {
      "title": "Packages & Pricing",
      "url": "/downloads-package"
    },
    {
      "title": "Recent Files",
      "url": "/recent-files"
    },
    {
      "title": "Our Agents",
      "url": "/our-agents"
    },
    {
      "title": "Contact Us",
      "url": "/contact-us"
    },
    {
      "title": "Request File",
      "url": "/request-file"
    },
    {
      "title": "Our Teams",
      "url": "/our-teams"
    },
    {
      "title": "Videos",
      "url": "/our-videos"
    },
    {
      "title": "Downloads",
      "url": "/downloads"
    }
  ];

  return res.status(200).json({
    data: pages
  });
}


module.exports = {
  addMenuItems,
  insertMenuItem,
  getMenuItems,
  getMenuItemsByType,
  getPages,
  getBlogs,
  getThemePages
};
