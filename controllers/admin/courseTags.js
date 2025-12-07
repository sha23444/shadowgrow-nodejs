const { pool } = require("../../config/database");

/**
 * Add a new product tag
 */
async function addTag(req, res) {
  const { tag_name, slug } = req.body;

  if (!tag_name) {
    return res.status(400).json({ error: "Tag name is required." });
  }

  try {
    // check if tag name or slug already exists

    const [existingTag] = await pool.execute(
      `SELECT * FROM res_course_tags WHERE tag_name = ? OR slug = ?`,
      [tag_name, slug]
    );

    if (existingTag.length) {
      return res.status(400).json({ error: "Tag or slug already exists." });
    }

    const [result] = await pool.execute(
      `INSERT INTO res_course_tags (tag_name, slug) VALUES (?, ?)`,
      [tag_name, slug]
    );

    res.status(201).json({
      message: "Tag added successfully",
      tag_id: result.insertId,
    });
  } catch (error) {
    console.error("Database error in addTag:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * Get all tags
 */
async function getAllTags(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    // Build the SQL query dynamically based on search
    const searchQuery = search ? `WHERE tag_name LIKE ? OR slug LIKE ?` : "";
    const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

    // Fetch tags with pagination and optional search
    const [tags] = await pool.execute(
      `SELECT * FROM res_course_tags ${searchQuery} LIMIT ? OFFSET ?`,
      [...searchParams, limit, offset]
    );

    // Fetch total count of tags for pagination metadata
    const [totalResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM res_course_tags ${searchQuery}`,
      searchParams
    );

    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limit);

    const result = {
      data: tags,
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
    };

    res.status(200).json({
      message: "Tags retrieved successfully",
      response: result,
    });
  } catch (error) {
    console.error("Database error in getAllTags:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * Delete a tag by ID
 */
async function deleteTag(req, res) {
  const { tagId } = req.params;

  if (!tagId) {
    return res.status(400).json({ error: "Tag ID is required." });
  }

  try {
    const [result] = await pool.execute(
      `DELETE FROM res_course_tags WHERE tag_id = ?`,
      [tagId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Tag not found." });
    }

    res.status(200).json({
      message: "Tag deleted successfully",
    });
  } catch (error) {
    console.error("Database error in deleteTag:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

/** update tags */

async function updateTag(req, res) {
  const { tagId } = req.params;
  const { tag_name, slug } = req.body;

  if (!tagId) {
    return res.status(400).json({ error: "Tag ID is required." });
  }

  try {
    // Check if tag name or slug already exists for a different tag
    const [existingTag] = await pool.execute(
      `SELECT * FROM res_course_tags 
       WHERE (tag_name = ? OR slug = ?) AND tag_id != ?`,
      [tag_name, slug, tagId]
    );

    if (existingTag.length) {
      return res
        .status(400)
        .json({ error: "Tag name or slug already exists." });
    }

    // Update the tag
    await pool.execute(
      `UPDATE res_course_tags SET tag_name = ?, slug = ? WHERE tag_id = ?`,
      [tag_name, slug, tagId]
    );

    res.status(200).json({
      message: "Tag updated successfully",
    });
  } catch (error) {
    console.error("Database error in updateTag:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * Get tags for a specific product
 */
async function getProductTags(req, res) {
  const { productId } = req.params;

  if (!productId) {
    return res.status(400).json({ error: "Product ID is required." });
  }

  try {
    const [tags] = await pool.execute(
      `SELECT pt.id AS tag_id, pt.tag_name 
       FROM res_course_tags pt
       JOIN res_course_tag_map ptm ON pt.id = ptm.tag_id
       WHERE ptm.product_id = ?`,
      [productId]
    );

    res.status(200).json({
      message: "Tags retrieved successfully",
      tags,
    });
  } catch (error) {
    console.error("Database error in getProductTags:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * Add tags to a specific product
 */
async function addProductTags(req, res) {
  const { productId } = req.params;
  const { tag_ids } = req.body; // Array of tag IDs

  if (!productId || !Array.isArray(tag_ids) || tag_ids.length === 0) {
    return res.status(400).json({
      error:
        "Product ID and tag IDs are required, and tag_ids must be an array.",
    });
  }

  try {
    const values = tag_ids.map((tagId) => [productId, tagId]);
    await pool.query(
      `INSERT INTO res_product_tag_map (product_id, tag_id) VALUES ?`,
      [values]
    );

    res.status(201).json({
      message: "Tags added to product successfully",
    });
  } catch (error) {
    console.error("Database error in addProductTags:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = {
  addTag,
  getAllTags,
  deleteTag,
  getProductTags,
  addProductTags,
  updateTag,
};
