const { pool } = require("../../config/database");
const { clearProductCache } = require("../../config/smart-cache");

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
      `SELECT * FROM res_product_tags WHERE tag_name = ? OR slug = ?`,
      [tag_name, slug]
    );

    if (existingTag.length) {
      return res.status(400).json({ error: "Tag or slug already exists." });
    }

    const [result] = await pool.execute(
      `INSERT INTO res_product_tags (tag_name, slug) VALUES (?, ?)`,
      [tag_name, slug]
    );
    
    // Clear product cache after adding tag
    await clearProductCache();

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
      `SELECT * FROM res_product_tags ${searchQuery} LIMIT ? OFFSET ?`,
      [...searchParams, limit, offset]
    );

    // Fetch total count of tags for pagination metadata
    const [totalResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM res_product_tags ${searchQuery}`,
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
      `DELETE FROM res_product_tags WHERE tag_id = ?`,
      [tagId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Tag not found." });
    }
    
    // Clear product cache after deleting tag
    await clearProductCache();

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
      `SELECT * FROM res_product_tags 
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
      `UPDATE res_product_tags SET tag_name = ?, slug = ? WHERE tag_id = ?`,
      [tag_name, slug, tagId]
    );
    
    // Clear product cache after updating tag
    await clearProductCache();

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
       FROM res_product_tags pt
       JOIN res_product_tag_map ptm ON pt.id = ptm.tag_id
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

/**
 * Get tags with product counts
 */
async function getTagsWithProductCount(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50; // Higher default limit for tags
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const includeEmpty = req.query.includeEmpty === 'true'; // Option to include tags with 0 products

    // Generate cache key
    const cacheKey = `tags:with-count:${search}:${page}:${limit}:${includeEmpty}`;
    
    // Check if Redis cache is available
    if (req.cache) {
      const cachedData = await req.cache.get(cacheKey);
      if (cachedData) {
        return res.status(200).json({
          status: "success",
          message: "Tags with product counts retrieved successfully",
          response: cachedData,
          cached: true
        });
      }
    }

    // Build search condition
    const searchCondition = search
      ? `AND (t.tag_name LIKE ? OR t.slug LIKE ?)`
      : "";
    const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

    // Build the main query to get tags with product counts
    let baseQuery = `
      SELECT 
        t.tag_id,
        t.tag_name,
        t.slug,
        COUNT(DISTINCT ptr.product_id) as product_count
      FROM res_product_tags t
      LEFT JOIN res_product_tag_relationship ptr ON t.tag_id = ptr.tag_id
      LEFT JOIN res_products p ON ptr.product_id = p.product_id AND p.status = 1
      WHERE 1=1 ${searchCondition}
      GROUP BY t.tag_id, t.tag_name, t.slug
    `;

    // Add condition to filter out tags with 0 products if includeEmpty is false
    if (!includeEmpty) {
      baseQuery += ` HAVING product_count > 0`;
    }

    baseQuery += ` ORDER BY product_count DESC, t.tag_name ASC LIMIT ? OFFSET ?`;

    // Execute the main query
    const [tags] = await pool.execute(
      baseQuery,
      [...searchParams, limit, offset]
    );

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM (
        SELECT t.tag_id
        FROM res_product_tags t
        LEFT JOIN res_product_tag_relationship ptr ON t.tag_id = ptr.tag_id
        LEFT JOIN res_products p ON ptr.product_id = p.product_id AND p.status = 1
        WHERE 1=1 ${searchCondition}
        GROUP BY t.tag_id
    `;

    if (!includeEmpty) {
      countQuery += ` HAVING COUNT(DISTINCT ptr.product_id) > 0`;
    }

    countQuery += `) as tag_counts`;

    const [totalResult] = await pool.execute(countQuery, searchParams);
    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Format the response
    const formattedTags = tags.map(tag => ({
      tag_id: tag.tag_id,
      tag_name: tag.tag_name,
      slug: tag.slug,
      product_count: parseInt(tag.product_count)
    }));

    const response = {
      data: formattedTags,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      summary: {
        totalTags: total,
        tagsWithProducts: formattedTags.filter(t => t.product_count > 0).length,
        totalProducts: formattedTags.reduce((sum, t) => sum + t.product_count, 0)
      }
    };

    // Cache the result if Redis is available (cache for 10 minutes)
    if (req.cache) {
      await req.cache.set(cacheKey, response, 600);
    }

    res.status(200).json({
      status: "success",
      message: "Tags with product counts retrieved successfully",
      response: response,
      cached: false
    });

  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ 
      status: "error",
      message: "Internal Server Error",
      error: error.message 
    });
  }
}

module.exports = {
  addTag,
  getAllTags,
  deleteTag,
  updateTag,
  getProductTags,
  addProductTags,
  getTagsWithProductCount,
};
