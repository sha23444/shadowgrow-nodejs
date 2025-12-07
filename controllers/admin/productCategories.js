const { pool } = require("../../config/database");
const { clearProductCache } = require("../../config/smart-cache");

// Enhanced Categories Controller with Infinite Level Support
// Uses Nested Set Model for efficient hierarchical queries

// Removed rebuildNestedSet function - not needed for basic category operations

// Removed buildTree function - not needed for basic category operations

// Removed buildHierarchyFromNestedSet function - not needed for basic category operations

// Add a new category
async function addCategory(req, res) {
  const { category_name, image = null, slug, parent_category_id = 0, sort_order = 0 } = req.body;

  if (!category_name) {
    return res.status(400).json({ error: "Category name is required." });
  }

  if (!slug) {
    return res.status(400).json({ error: "Category slug is required." });
  }

  // Check if category or slug already exists
  const [existingCategory] = await pool.execute(
    `SELECT * FROM res_product_categories WHERE category_name = ? OR slug = ?`,
    [category_name, slug]
  );

  if (existingCategory.length) {
    return res.status(400).json({ error: "Category or slug already exists." });
  }

  // Validate parent category exists (if parent_category_id is not 0)
  if (parent_category_id !== 0) {
    const [parentCategory] = await pool.execute(
      `SELECT category_id FROM res_product_categories WHERE category_id = ?`,
      [parent_category_id]
    );

    if (parentCategory.length === 0) {
      return res.status(400).json({ error: "Parent category does not exist." });
    }
  }

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Insert new category
    const [result] = await connection.execute(
      `INSERT INTO res_product_categories (category_name, image, slug, parent_category_id, sort_order) 
       VALUES (?, ?, ?, ?, ?)`,
      [category_name, image, slug, parent_category_id, sort_order]
    );
    
    await connection.commit();
    
    // Clear product cache after adding category
    await clearProductCache();
    
    res.status(201).json({ 
      message: "Category added successfully",
      categoryId: result.insertId
    });
    
  } catch (error) {
    await connection.rollback();
    console.error("Database error:", error);
    
    // Provide specific error messages based on error type
    if (error.code === 'ER_DUP_ENTRY') {
      if (error.message.includes('category_name')) {
        return res.status(409).json({ error: "Category name already exists." });
      } else if (error.message.includes('slug')) {
        return res.status(409).json({ error: "Category slug already exists." });
      }
    } else if (error.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({ error: "Category name or slug is too long." });
    } else if (error.code === 'ER_BAD_NULL_ERROR') {
      return res.status(400).json({ error: "Required fields cannot be empty." });
    } else if (error.code === 'ER_TRUNCATED_WRONG_VALUE') {
      return res.status(400).json({ error: "Invalid data format provided." });
    } else if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: "Parent category does not exist." });
    }
    
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    connection.release();
  }
}

// Get categories with infinite level support
async function listCategories(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const includeSubcategories = req.query.includeSubcategories === 'true';
    const showHierarchy = req.query.showHierarchy === 'true' || includeSubcategories;
    const maxDepth = parseInt(req.query.maxDepth, 10) || null;

    // Build search condition
    const searchCondition = search
      ? `AND (category_name LIKE ? OR slug LIKE ? OR path LIKE ?)`
      : "";
    const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

    // Build depth condition
    const depthCondition = maxDepth ? `AND depth <= ?` : "";
    const depthParams = maxDepth ? [maxDepth] : [];

    if (showHierarchy) {
      // Check if user wants flat list with all categories and subcategories
      if (includeSubcategories) {
        // Get ALL categories (including subcategories) in flat list with paths
        const [allCategories] = await pool.execute(
          `SELECT * FROM res_product_categories 
           WHERE 1=1 ${searchCondition} ${depthCondition}
           ORDER BY category_id ASC 
           LIMIT ? OFFSET ?`,
          [...searchParams, ...depthParams, limit, offset]
        );

        // Calculate category paths and levels dynamically
        const categoriesWithPaths = await Promise.all(allCategories.map(async (category) => {
          let path = category.category_name;
          let level = 0;
          let currentParentId = category.parent_category_id;

          // Build path by traversing up the hierarchy
          while (currentParentId !== 0) {
            const [parent] = await pool.execute(
              `SELECT category_name, parent_category_id FROM res_product_categories WHERE category_id = ?`,
              [currentParentId]
            );
            
            if (parent.length > 0) {
              path = `${parent[0].category_name} > ${path}`;
              level++;
              currentParentId = parent[0].parent_category_id;
            } else {
              break;
            }
          }

          return {
            ...category,
            category_path: path,
            category_level: level
          };
        }));

        // Get total count of ALL categories
        const [totalResult] = await pool.execute(
          `SELECT COUNT(*) as total FROM res_product_categories 
           WHERE 1=1 ${searchCondition} ${depthCondition}`,
          [...searchParams, ...depthParams]
        );

        const total = totalResult[0].total;
        const totalPages = Math.ceil(total / limit);

        const result = {
          data: categoriesWithPaths,
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit,
        };

        return res.status(200).json({
          message: "Categories retrieved successfully",
          response: result,
        });
      } else {
        // Get hierarchical structure starting from root categories only
        const [rootCategories] = await pool.execute(
          `SELECT * FROM res_product_categories 
           WHERE parent_category_id = 0 ${searchCondition} ${depthCondition}
           ORDER BY sort_order ASC, category_name ASC 
           LIMIT ? OFFSET ?`,
          [...searchParams, ...depthParams, limit, offset]
        );

        // Get all descendants for each root category
        for (let rootCategory of rootCategories) {
          const [descendants] = await pool.execute(
            `SELECT * FROM res_product_categories 
             WHERE lft > ? AND rgt < ? 
             ORDER BY lft ASC`,
            [rootCategory.lft, rootCategory.rgt]
          );
          
          // Build hierarchical structure
          rootCategory.subcategories = buildHierarchyFromNestedSet(descendants);
        }

        // Get total count of root categories
        const [totalResult] = await pool.execute(
          `SELECT COUNT(*) as total FROM res_product_categories 
           WHERE parent_category_id = 0 ${searchCondition} ${depthCondition}`,
          [...searchParams, ...depthParams]
        );

        const total = totalResult[0].total;
        const totalPages = Math.ceil(total / limit);

        const result = {
          data: rootCategories,
          currentPage: page,
          totalPages,
          totalItems: total,
          itemsPerPage: limit,
        };

        return res.status(200).json({
          message: "Categories retrieved successfully",
          response: result,
        });
      }
    }

    // Flat list with category paths
    const [categories] = await pool.execute(
      `SELECT * FROM res_product_categories 
       WHERE 1=1 ${searchCondition} ${depthCondition}
       ORDER BY category_id ASC 
       LIMIT ? OFFSET ?`,
      [...searchParams, ...depthParams, limit, offset]
    );

    // Calculate category paths and levels dynamically
    const categoriesWithPaths = await Promise.all(categories.map(async (category) => {
      let path = category.category_name;
      let level = 0;
      let currentParentId = category.parent_category_id;

      // Build path by traversing up the hierarchy
      while (currentParentId !== 0) {
        const [parent] = await pool.execute(
          `SELECT category_name, parent_category_id FROM res_product_categories WHERE category_id = ?`,
          [currentParentId]
        );
        
        if (parent.length > 0) {
          path = `${parent[0].category_name} > ${path}`;
          level++;
          currentParentId = parent[0].parent_category_id;
        } else {
          break;
        }
      }

      return {
        ...category,
        category_path: path,
        category_level: level
      };
    }));

    // Get total count
    const [totalResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM res_product_categories 
       WHERE 1=1 ${searchCondition} ${depthCondition}`,
      [...searchParams, ...depthParams]
    );

    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limit);

    const result = {
      data: categoriesWithPaths,
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

// Get categories with hierarchical structure (alternative endpoint)
async function getCategoriesHierarchy(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    // Build search condition for root categories
    const searchCondition = search
      ? `AND (category_name LIKE ? OR slug LIKE ?)`
      : "";
    const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

    // Fetch root categories with pagination
    const [rootCategories] = await pool.execute(
      `SELECT * FROM res_product_categories 
       WHERE parent_category_id = 0 ${searchCondition}
       ORDER BY category_name ASC LIMIT ? OFFSET ?`,
      [...searchParams, limit, offset]
    );

    // Get all subcategories and sub-subcategories for the root categories
    const rootCategoryIds = rootCategories.map(cat => cat.category_id);
    if (rootCategoryIds.length > 0) {
      const placeholders = rootCategoryIds.map(() => '?').join(',');
      
      // Fetch level 2 categories
      const [level2Categories] = await pool.execute(
        `SELECT * FROM res_product_categories WHERE parent_category_id IN (${placeholders}) ORDER BY parent_category_id ASC, category_name ASC`,
        rootCategoryIds
      );

      // Fetch level 3 categories
      const level2CategoryIds = level2Categories.map(cat => cat.category_id);
      let level3Categories = [];
      if (level2CategoryIds.length > 0) {
        const level2Placeholders = level2CategoryIds.map(() => '?').join(',');
        const [level3Result] = await pool.execute(
          `SELECT * FROM res_product_categories WHERE parent_category_id IN (${level2Placeholders}) ORDER BY parent_category_id ASC, category_name ASC`,
          level2CategoryIds
        );
        level3Categories = level3Result;
      }

      // Group level 2 categories by parent
      const level2ByParent = {};
      level2Categories.forEach(cat => {
        if (!level2ByParent[cat.parent_category_id]) {
          level2ByParent[cat.parent_category_id] = [];
        }
        level2ByParent[cat.parent_category_id].push(cat);
      });

      // Group level 3 categories by parent
      const level3ByParent = {};
      level3Categories.forEach(cat => {
        if (!level3ByParent[cat.parent_category_id]) {
          level3ByParent[cat.parent_category_id] = [];
        }
        level3ByParent[cat.parent_category_id].push(cat);
      });

      // Build hierarchical structure
      rootCategories.forEach(rootCategory => {
        rootCategory.subcategories = level2ByParent[rootCategory.category_id] || [];
        
        // Add level 3 categories to their level 2 parents
        rootCategory.subcategories.forEach(level2Category => {
          level2Category.subcategories = level3ByParent[level2Category.category_id] || [];
        });
      });
    }

    // Get total count of root categories for pagination
    const [totalResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM res_product_categories WHERE parent_category_id = 0 ${searchCondition}`,
      searchParams
    );

    const total = totalResult[0].total;
    const totalPages = Math.ceil(total / limit);

    const result = {
      data: rootCategories,
      currentPage: page,
      totalPages,
      totalItems: total,
      itemsPerPage: limit,
    };

    res.status(200).json({
      message: "Categories hierarchy retrieved successfully",
      response: result,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get category tree (all levels)
// Removed getCategoryTree function - not needed

// Removed getCategoryPath function - not needed

// Removed moveCategory function - not needed

// Update category
async function updateCategory(req, res) {
  const { category_name, image = null, slug, parent_category_id = 0, sort_order = 0 } = req.body;
  const { categoryId } = req.params;

  if (!categoryId) {
    return res.status(400).json({ error: "Category ID is required in the URL." });
  }

  if (!category_name) {
    return res.status(400).json({ error: "Category name is required." });
  }

  if (!slug) {
    return res.status(400).json({ error: "Category slug is required." });
  }

  // Validate parent category exists (if parent_category_id is not 0)
  if (parent_category_id !== 0) {
    const [parentCategory] = await pool.execute(
      `SELECT category_id FROM res_product_categories WHERE category_id = ?`,
      [parent_category_id]
    );

    if (parentCategory.length === 0) {
      return res.status(400).json({ error: "Parent category does not exist." });
    }
  }

  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Check if another category with the same name or slug exists
    const [existingCategory] = await connection.execute(
      `SELECT * FROM res_product_categories 
       WHERE (category_name = ? OR slug = ?) AND category_id != ?`,
      [category_name, slug, categoryId]
    );

    if (existingCategory.length) {
      return res.status(400).json({ 
        error: "Another category with the same name or slug already exists." 
      });
    }

    // Update category
    await connection.execute(
      `UPDATE res_product_categories 
       SET category_name = ?, image = ?, slug = ?, parent_category_id = ?, sort_order = ?
       WHERE category_id = ?`,
      [category_name, image, slug, parent_category_id, sort_order, categoryId]
    );
    
    await connection.commit();
    
    // Clear product cache after updating category
    await clearProductCache();

    res.status(200).json({ message: "Category updated successfully" });
    
  } catch (error) {
    await connection.rollback();
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    connection.release();
  }
}

// Delete category and all descendants
async function deleteCategory(req, res) {
  try {
    const { categoryId } = req.params;
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Get category to find its boundaries
      const [category] = await connection.execute(
        `SELECT lft, rgt FROM res_product_categories WHERE category_id = ?`,
        [categoryId]
      );
      
      if (category.length === 0) {
        return res.status(404).json({ error: "Category not found" });
      }
      
      // Delete category and all descendants
      await connection.execute(
        `DELETE FROM res_product_categories 
         WHERE lft >= ? AND rgt <= ?`,
        [category[0].lft, category[0].rgt]
      );
      
      // Rebuild nested set values
      await connection.commit();
      
      // Clear product cache after deleting category
      await clearProductCache();
      
      res.status(200).json({ 
        message: "Category and all descendants deleted successfully" 
      });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get subcategories
async function getSubcategories(req, res) {
  const { categoryId } = req.params;

  if (!categoryId) {
    return res.status(400).json({ error: "Category ID is required in the URL." });
  }

  try {
    // Get direct children using nested set
    const [subcategories] = await pool.execute(
      `SELECT c1.* FROM res_product_categories c1
       WHERE c1.parent_category_id = ?
       ORDER BY c1.sort_order ASC, c1.category_name ASC`,
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

// Removed rebuildNestedSetEndpoint - not needed

module.exports = {
  addCategory,
  deleteCategory,
  updateCategory,
  listCategories,
  getSubcategories,
  getCategoriesHierarchy,
};