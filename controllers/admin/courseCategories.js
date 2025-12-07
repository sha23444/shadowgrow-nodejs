const { pool } = require("../../config/database");

// Add a new category
async function addCategory(req, res) {
  const { category_name, image = null, slug, parent_category_id = 0 } = req.body;

  if (!category_name) {
    return res.status(400).json({ error: "Category name is required." });
  }

  // category and slug unique

  if (!slug) {
    return res.status(400).json({ error: "Category slug is required." });
  }

  // check category and slug is present already

  const [existingCategory] = await pool.execute(
    `SELECT * FROM res_course_categories WHERE category_name = ? OR slug = ?`,
    [category_name, slug]
  );

  if (existingCategory.length) {
    return res.status(400).json({ error: "Category or slug already exists." });
  }

  try {
    await pool.execute(
      `INSERT INTO res_course_categories (category_name, image, slug, parent_category_id) VALUES (?, ?, ?, ?)`,
      [category_name, image, slug, parent_category_id]
    );

    res.status(201).json({ message: "Category added successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function deleteCategory(req, res) {
  const { categoryId } = req.params;

  if (!categoryId) {
    return res
      .status(400)
      .json({ error: "Category ID is required in the URL." });
  }

  try {
    await pool.execute(
      `DELETE FROM res_course_categories WHERE category_id = ?`,
      [categoryId]
    );

    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function updateCategory(req, res) {
  const { category_name, image = null, slug, parent_category_id = 0 } = req.body;
  const { categoryId } = req.params;

  if (!categoryId) {
    return res
      .status(400)
      .json({ error: "Category ID is required in the URL." });
  }

  if (!category_name) {
    return res.status(400).json({ error: "Category name is required." });
  }

  if (!slug) {
    return res.status(400).json({ error: "Category slug is required." });
  }

  try {
    // Check if another category with the same name or slug exists
    const [existingCategory] = await pool.execute(
      `SELECT * FROM res_course_categories 
       WHERE (category_name = ? OR slug = ?) AND category_id != ?`,
      [category_name, slug, categoryId]
    );

    if (existingCategory.length) {
      return res
        .status(400)
        .json({ error: "Another category with the same name or slug already exists." });
    }

    // Perform the update
    await pool.execute(
      `UPDATE res_course_categories 
       SET category_name = ?, image = ?, slug = ?, parent_category_id = ? 
       WHERE category_id = ?`,
      [category_name, image, slug, parent_category_id, categoryId]
    );

    res.status(200).json({ message: "Category updated successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}


// Get subcategories of a single category
async function getSubcategories(req, res) {
  const { categoryId } = req.params; // Extract categoryId from request params

  if (!categoryId) {
    return res
      .status(400)
      .json({ error: "Category ID is required in the URL." });
  }

  try {
    // Query to fetch subcategories of the given category ID
    const [subcategories] = await pool.execute(
      `
      SELECT * 
      FROM res_course_categories 
      WHERE parent_category_id = ?
    `,
      [categoryId]
    );

    res.status(200).json({
      data: subcategories,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function listCategories(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    // Build the SQL query dynamically
    const searchQuery = search
      ? `WHERE category_name LIKE ? OR slug LIKE ?`
      : "";
    const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

    // Fetch categories with pagination and optional search
    const [categories] = await pool.execute(
      `SELECT * FROM res_course_categories ${searchQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...searchParams, limit, offset]
    );

    // Fetch total count of categories for pagination metadata
    const [totalResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM res_course_categories ${searchQuery}`,
      searchParams
    );

    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limit);

    const result = {
      data: categories,
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
    };

    res.status(200).json({
      message: "Categories retrieved successfully",
      response: result,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  addCategory,
  deleteCategory,
  updateCategory,
  listCategories,
  getSubcategories,
};
