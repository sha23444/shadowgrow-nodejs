const express = require("express");
const { pool } = require("../../config/database");

async function getPages(req, res) {
  try {
    const slug = req.params.slug;

    const [pages] = await pool.query(
      `SELECT *
            FROM res_pages p
            WHERE p.slug = ?`,
      [slug]
    );

    if (pages.length === 0) {
      return res
        .status(404)
        .json({ message: "No pages found", status: "error" });
    }

    res.status(200).json({
      data: pages[0],
      status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

module.exports = {
  getPages,
};
