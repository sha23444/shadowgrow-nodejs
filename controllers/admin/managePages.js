const { pool } = require("../../config/database");
const fs = require('fs');
const path = require('path');
const { clearPageCache } = require("../../config/smart-cache");

async function getPages(req, res) {
  try {
    // Extract `page` and `limit` from query parameters, with default values.
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // Calculate the `offset` for pagination.
    const offset = (page - 1) * limit;

    // Fetch the paginated results.
    const [rows] = await pool.query(
      "SELECT * FROM res_pages LIMIT ? OFFSET ?",
      [limit, offset]
    );

    // Get the total number of records for pagination metadata.
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) AS total FROM res_pages"
    );

    let response = {
      data: rows,
      status: "success",
      page,
      limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
    }
    // Send the paginated results along with metadata.
    res.status(200).json({
      response: response,
      status: "success",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}


async function getPageDetailsById(req, res) {
  try {

    const page_id = req.params.id;

    const [rows] = await pool.query("SELECT * FROM res_pages WHERE page_id = ?", [
      page_id,
    ]);

    res.status(200).json({
      data: rows[0],
      status: "success",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

async function updatePage(req, res) {
  try {
    const id = req.params.id;

    const { slug, title, description, body, layout, is_active, meta_title, meta_keywords, meta_description, key } = req.body;

    await pool.query(
      "UPDATE res_pages SET slug = ?, title = ?, description = ?, body = ?, layout = ?, is_active = ?, meta_title = ?, meta_keywords = ?, meta_description = ?, `key` = ? WHERE page_id = ?",
      [slug, title, description, body, layout, is_active, meta_title, meta_keywords, meta_description, key, id]
    );

    // Clear cache after update
    await clearPageCache(id, slug);

    res.status(200).json({
      message: "Page updated successfully",
      status: "success",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

async function createPage(req, res) {
  try {
    const { slug, title, description, layout = 1, body, is_active, meta_title, meta_keywords, meta_description, key } = req.body;

    // Check if page with the same slug already exists

    const [rows] = await pool.query("SELECT * FROM res_pages WHERE slug = ?", [
      slug,
    ]);

    if (rows.length > 0) {
      return res.status(400).json({
        message: "Page with the same slug already exists",
        status: "error",
      });
    }

    await pool.query(
      "INSERT INTO res_pages (slug, title, description, body, layout, is_active, meta_title, meta_keywords, meta_description, `key`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [slug, title, description, body, layout, is_active, meta_title, meta_keywords, meta_description, key]
    );

    // Clear cache after creating new page
    await clearPageCache(null, slug);

    res.status(200).json({
      message: "Page created successfully",
      status: "success",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

async function deletePage(req, res) {
  try {
    const id = req.params.id;

    await pool.query("DELETE FROM res_pages WHERE page_id = ?", [id]);

    // Clear cache after deletion
    await clearPageCache(id);

    res.status(200).json({
      message: "Page deleted successfully",
      status: "success",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

module.exports = {
  getPages,
  getPageDetailsById,
  updatePage,
  createPage,
  deletePage,
};
