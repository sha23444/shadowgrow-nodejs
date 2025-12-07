const { pool } = require("../../config/database");
const { STATIC_PAGES } = require("../utils/constants");

// Get all SEO data with pagination
async function getAllSEO(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let whereClause = '';
    let params = [];

    if (search) {
      whereClause = 'WHERE page_title LIKE ? OR page_slug LIKE ? OR meta_title LIKE ?';
      params = [`%${search}%`, `%${search}%`, `%${search}%`];
    }

    // Get total count
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) as total FROM res_seo ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get SEO data with pagination
    const [seoResult] = await pool.execute(
      `SELECT * FROM res_seo ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      success: true,
      data: seoResult,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching SEO data:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error"
    });
  }
}

// Get SEO data by ID
async function getSEOById(req, res) {
  try {
    const { id } = req.params;

    const [seoResult] = await pool.execute(
      'SELECT * FROM res_seo WHERE id = ?',
      [id]
    );

    if (seoResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: "SEO data not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: seoResult[0]
    });
  } catch (error) {
    console.error("Error fetching SEO data by ID:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error"
    });
  }
}

// Get SEO data by page slug
async function getSEOBySlug(req, res) {
  try {
    const { slug } = req.params;

    const [seoResult] = await pool.execute(
      'SELECT * FROM res_seo WHERE page_slug = ?',
      [slug]
    );

    if (seoResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: "SEO data not found for this page"
      });
    }

    return res.status(200).json({
      success: true,
      data: seoResult[0]
    });
  } catch (error) {
    console.error("Error fetching SEO data by slug:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error"
    });
  }
}

// Create new SEO data
async function createSEO(req, res) {
  try {
    const {
      page_slug,
      page_title,
      meta_title,
      meta_description,
      meta_keywords,
      og_title,
      og_description,
      og_image,
      twitter_title,
      twitter_description,
      twitter_image,
      canonical_url,
      robots,
      status
    } = req.body;

    // Validate required fields
    if (!page_slug || !page_title) {
      return res.status(400).json({
        success: false,
        error: "Page slug and page title are required"
      });
    }

    // Check if page_slug already exists
    const [existingResult] = await pool.execute(
      'SELECT id FROM res_seo WHERE page_slug = ?',
      [page_slug]
    );

    if (existingResult.length > 0) {
      return res.status(400).json({
        success: false,
        error: "SEO data for this page already exists"
      });
    }

    // Insert new SEO data
    const [result] = await pool.execute(
      `INSERT INTO res_seo (
        page_slug, page_title, meta_title, meta_description, meta_keywords,
        og_title, og_description, og_image, twitter_title, twitter_description,
        twitter_image, canonical_url, robots, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        page_slug, page_title, meta_title, meta_description, meta_keywords,
        og_title, og_description, og_image, twitter_title, twitter_description,
        twitter_image, canonical_url, robots || 'index,follow', status || 1
      ]
    );

    return res.status(201).json({
      success: true,
      message: "SEO data created successfully",
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error("Error creating SEO data:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error"
    });
  }
}

// Update SEO data
async function updateSEO(req, res) {
  try {
    const { id } = req.params;
    const {
      meta_title,
      meta_description,
      meta_keywords,
    } = req.body;

    // Check if SEO data exists
    const [existingResult] = await pool.execute(
      'SELECT id FROM res_seo WHERE id = ?',
      [id]
    );

    if (existingResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: "SEO data not found"
      });
    }

    // Update SEO data
    await pool.execute(
      `UPDATE res_seo SET 
         meta_title = ?, meta_description = ?, 
        meta_keywords = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        meta_title, meta_description, meta_keywords, id
      ]
    );

    return res.status(200).json({
      success: true,
      message: "SEO data updated successfully"
    });
  } catch (error) {
    console.error("Error updating SEO data:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error"
    });
  }
}

// Delete SEO data
async function deleteSEO(req, res) {
  try {
    const { id } = req.params;

    // Check if SEO data exists
    const [existingResult] = await pool.execute(
      'SELECT id FROM res_seo WHERE id = ?',
      [id]
    );

    if (existingResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: "SEO data not found"
      });
    }

    // Delete SEO data
    await pool.execute('DELETE FROM res_seo WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: "SEO data deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting SEO data:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error"
    });
  }
}

// Bulk update SEO data
async function bulkUpdateSEO(req, res) {
  try {
    const { seoData } = req.body;

    if (!Array.isArray(seoData) || seoData.length === 0) {
      return res.status(400).json({
        success: false,
        error: "SEO data array is required"
      });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      for (const item of seoData) {
        const {
          id,
          page_slug,
          page_title,
          meta_title,
          meta_description,
          meta_keywords,
          og_title,
          og_description,
          og_image,
          twitter_title,
          twitter_description,
          twitter_image,
          canonical_url,
          robots,
          status
        } = item;

        if (id) {
          // Update existing record
          await connection.execute(
            `UPDATE res_seo SET 
              page_slug = ?, page_title = ?, meta_title = ?, meta_description = ?, 
              meta_keywords = ?, og_title = ?, og_description = ?, og_image = ?, 
              twitter_title = ?, twitter_description = ?, twitter_image = ?, 
              canonical_url = ?, robots = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [
              page_slug, page_title, meta_title, meta_description, meta_keywords,
              og_title, og_description, og_image, twitter_title, twitter_description,
              twitter_image, canonical_url, robots, status, id
            ]
          );
        } else {
          // Insert new record
          await connection.execute(
            `INSERT INTO res_seo (
              page_slug, page_title, meta_title, meta_description, meta_keywords,
              og_title, og_description, og_image, twitter_title, twitter_description,
              twitter_image, canonical_url, robots, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              page_slug, page_title, meta_title, meta_description, meta_keywords,
              og_title, og_description, og_image, twitter_title, twitter_description,
              twitter_image, canonical_url, robots || 'index,follow', status || 1
            ]
          );
        }
      }

      await connection.commit();
      connection.release();

      return res.status(200).json({
        success: true,
        message: "SEO data updated successfully"
      });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error("Error bulk updating SEO data:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error"
    });
  }
}

// Get available pages for SEO management
async function getAvailablePages(req, res) {
  try {
    // Get all pages that don't have SEO data yet
    const [existingSeoResult] = await pool.execute(
      'SELECT page_slug FROM res_seo'
    );

    const existingSlugs = existingSeoResult.map(item => item.page_slug);
    const availablePages = STATIC_PAGES.filter(page => !existingSlugs.includes(page.slug));

    return res.status(200).json({
      success: true,
      data: availablePages
    });
  } catch (error) {
    console.error("Error fetching available pages:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error"
    });
  }
}

// Toggle SEO status
async function toggleSEOStatus(req, res) {
  try {
    const { id } = req.params;

    // Check if SEO data exists
    const [existingResult] = await pool.execute(
      'SELECT id, status FROM res_seo WHERE id = ?',
      [id]
    );

    if (existingResult.length === 0) {
      return res.status(404).json({
        success: false,
        error: "SEO data not found"
      });
    }

    const currentStatus = existingResult[0].status;
    const newStatus = currentStatus === 1 ? 0 : 1;

    // Update status
    await pool.execute(
      'UPDATE res_seo SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, id]
    );

    return res.status(200).json({
      success: true,
      message: `SEO data ${newStatus === 1 ? 'activated' : 'deactivated'} successfully`,
      data: { status: newStatus }
    });
  } catch (error) {
    console.error("Error toggling SEO status:", error);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error"
    });
  }
}

module.exports = {
  getAllSEO,
  getSEOById,
  getSEOBySlug,
  createSEO,
  updateSEO,
  deleteSEO,
  bulkUpdateSEO,
  getAvailablePages,
  toggleSEOStatus
};
