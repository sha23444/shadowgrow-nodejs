const { pool } = require("../../../config/database");

async function getCategories(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;

  let conn;
  try {
    conn = await pool.getConnection();

    // Count query
    const totalQuery = `
      SELECT COUNT(*) as total 
      FROM res_blogs_categories
    `;
    const [[{ total }]] = await conn.query(totalQuery);

    // Categories query
    const categoriesQuery = `
      SELECT category_id AS id, name, parent_id, created_at
      FROM res_blogs_categories 
      WHERE parent_id IS NULL
      ORDER BY category_id ASC
      LIMIT ? OFFSET ?
    `;
    const [categories] = await conn.query(categoriesQuery, [limit, offset]);

    // Fetch all subcategories at once
    const subcategoriesQuery = `
      SELECT category_id AS id, name, parent_id, created_at
      FROM res_blogs_categories 
      WHERE parent_id IS NOT NULL
    `;
    const [subcategories] = await conn.query(subcategoriesQuery);

    // Map subcategories to their parent categories
    categories.forEach(category => {
      category.subcategories = subcategories.filter(subcategory => subcategory.parent_id === category.id);
    });

    res.status(200).json({
      status: "success",
      response: {
        data: categories,
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release(); // Always release connection back to the pool
  }
}

async function getSubcategories(req, res) {
  const categoryId = req.query.category_id;
  const search = req.query.search || '';
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const offset = (page - 1) * limit;

  if (!categoryId) {
    return res.status(400).json({
      status: "error",
      message: "Category ID is required",
    });
  }

  try {
    const conn = await pool.getConnection();

    // Count query for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM res_blogs_categories 
      WHERE parent_id = ? AND name LIKE ?
    `;
    const [[{ total }]] = await conn.query(countQuery, [categoryId, `%${search}%`]);

    // Fetch subcategories with pagination and search
    const subcategoriesQuery = `
      SELECT category_id AS id, name, parent_id, created_at
      FROM res_blogs_categories 
      WHERE parent_id = ? AND name LIKE ?
      ORDER BY category_id ASC
      LIMIT ? OFFSET ?
    `;
    const [subcategories] = await conn.query(subcategoriesQuery, [categoryId, `%${search}%`, limit, offset]);

    conn.release(); // Release connection back to the pool

    res.status(200).json({
      status: "success",
      response: {
        data: subcategories,
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


async function updateCategory(req, res) {
  const { name, category_id } = req.body;

  try {
    const conn = await pool.getConnection();
    await conn.beginTransaction();

    try {

      // Check if the category exists
      const [category] = await conn.query(
        "SELECT * FROM res_blogs_categories WHERE category_id = ?",
        [category_id]
      );

      if (category.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Category not found",
        });
      }

      // Update the category
      const updateQuery = `
        UPDATE res_blogs_categories 
        SET name = ? 
        WHERE category_id = ?
      `;
      await conn.query(updateQuery, [name, category_id]);

      await conn.commit();

      res.status(200).json({
        status: "success",
        message: "Category updated successfully",
        data: {
          id: category_id,
          name,
        },
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


async function createCategory(req, res) {
  const { name, parent_id = null } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({
      status: "error",
      message: "Invalid 'name' provided",
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    await conn.beginTransaction();

    const insertQuery = `
      INSERT INTO res_blogs_categories (name, parent_id)
      VALUES (?, ?)
    `;
    const [result] = await conn.query(insertQuery, [name, parent_id || null]);

    await conn.commit();

    res.status(201).json({
      status: "success",
      message: "Category created successfully",
      data: {
        id: result.insertId,
        name,
        parent_id: parent_id || null,
      },
    });
  } catch (err) {
    if (conn) await conn.rollback();
    res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
}


async function deleteCategory(req, res) {
  if (!req.params.id) {
    return res.status(400).json({
      status: "error",
      message: "Category ID is required",
    });
  }

  try {
    const conn = await pool.getConnection();

    // Delete subcategories first (to avoid foreign key constraint issues)
    await conn.query("DELETE FROM res_blogs_categories WHERE parent_id = ?", [req.params.id]);

    const [result] = await conn.query(
      "DELETE FROM res_blogs_categories WHERE category_id = ?",
      [req.params.id]
    );

    conn.release();  // Release connection back to the pool

    if (result.affectedRows > 0) {
      res.json({ message: 'Category and its subcategories deleted' });
    } else {
      res.status(404).json({ error: 'Category not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// get all categories with subcategories for select dropdown

async function getAllCategoriesWithSubcategories(req, res) {
  try {
    const conn = await pool.getConnection();

    // Categories query
    const categoriesQuery = `
      SELECT category_id AS id, name, parent_id, created_at
      FROM res_blogs_categories 
      WHERE parent_id IS NULL
      ORDER BY category_id ASC
    `;
    const [categories] = await conn.query(categoriesQuery);

    // Fetch all subcategories at once
    const subcategoriesQuery = `
      SELECT category_id AS id, name, parent_id, created_at
      FROM res_blogs_categories 
      WHERE parent_id IS NOT NULL
    `;
    const [subcategories] = await conn.query(subcategoriesQuery);

    // Map subcategories to their parent categories
    categories.forEach(category => {
      category.subcategories = subcategories.filter(subcategory => subcategory.parent_id === category.id);
    });
    
    conn.release();  // Release connection back to the pool

    res.status(200).json({
      status: "success",
      response:  categories,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}


module.exports = {
  getCategories,
  createCategory,
  deleteCategory, 
  updateCategory,
  getSubcategories,
  getAllCategoriesWithSubcategories,
};