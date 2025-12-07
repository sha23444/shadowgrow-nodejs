const { pool } = require("../../config/database");

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
      FROM res_product_categories 
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
      `SELECT * FROM res_product_categories ${searchQuery} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...searchParams, limit, offset]
    );

    // Fetch total count of categories for pagination metadata
    const [totalResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM res_product_categories ${searchQuery}`,
      searchParams
    );

    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      message: "Categories retrieved successfully",
      response: {
        data: categories,
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCategoriesWithProductCount(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50; // Higher default limit for categories
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const includeEmpty = req.query.includeEmpty === 'true'; // Option to include categories with 0 products

    // Generate cache key
    const cacheKey = `categories:with-count:${search}:${page}:${limit}:${includeEmpty}`;
    
    // Check if Redis cache is available
    if (req.cache) {
      const cachedData = await req.cache.get(cacheKey);
      if (cachedData) {
        return res.status(200).json({
          status: "success",
          message: "Categories with product counts retrieved successfully",
          response: cachedData,
          cached: true
        });
      }
    }

    // Build search condition
    const searchCondition = search
      ? `AND (c.category_name LIKE ? OR c.slug LIKE ?)`
      : "";
    const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

    // Build the main query to get categories with product counts
    let baseQuery = `
      SELECT 
        c.category_id,
        c.category_name,
        c.slug,
        c.image,
        c.parent_category_id,
        c.created_at,
        COUNT(DISTINCT pcr.product_id) as product_count
      FROM res_product_categories c
      LEFT JOIN res_product_category_relationship pcr ON c.category_id = pcr.category_id
      LEFT JOIN res_products p ON pcr.product_id = p.product_id AND p.status = 1
      WHERE 1=1 ${searchCondition}
      GROUP BY c.category_id, c.category_name, c.slug, c.image, c.parent_category_id, c.created_at
    `;

    // Add condition to filter out categories with 0 products if includeEmpty is false
    if (!includeEmpty) {
      baseQuery += ` HAVING product_count > 0`;
    }

    baseQuery += ` ORDER BY product_count DESC, c.category_name ASC LIMIT ? OFFSET ?`;

    // Execute the main query
    const [categories] = await pool.execute(
      baseQuery,
      [...searchParams, limit, offset]
    );

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM (
        SELECT c.category_id
        FROM res_product_categories c
        LEFT JOIN res_product_category_relationship pcr ON c.category_id = pcr.category_id
        LEFT JOIN res_products p ON pcr.product_id = p.product_id AND p.status = 1
        WHERE 1=1 ${searchCondition}
        GROUP BY c.category_id
    `;

    if (!includeEmpty) {
      countQuery += ` HAVING COUNT(DISTINCT pcr.product_id) > 0`;
    }

    countQuery += `) as category_counts`;

    const [totalResult] = await pool.execute(countQuery, searchParams);
    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limit);

    // Format the response
    const formattedCategories = categories.map(category => ({
      category_id: category.category_id,
      category_name: category.category_name,
      slug: category.slug,
      image: category.image,
      parent_category_id: category.parent_category_id,
      product_count: parseInt(category.product_count),
      created_at: category.created_at
    }));

    const response = {
      data: formattedCategories,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      },
      summary: {
        totalCategories: total,
        categoriesWithProducts: formattedCategories.filter(c => c.product_count > 0).length,
        totalProducts: formattedCategories.reduce((sum, c) => sum + c.product_count, 0)
      }
    };

    // Cache the result if Redis is available (cache for 10 minutes)
    if (req.cache) {
      await req.cache.set(cacheKey, response, 600);
    }

    res.status(200).json({
      status: "success",
      message: "Categories with product counts retrieved successfully",
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
  listCategories,
  getSubcategories,
  getCategoriesWithProductCount,
};
