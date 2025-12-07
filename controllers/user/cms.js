const { pool } = require("../../config/database");

async function getCarouselBanner(req, res) {
  try {
    const [banners] = await pool.execute(
      `SELECT * FROM banners WHERE is_active = 1`
    );
    return res.status(200).json({data: banners });
  } catch (error) {
//     // console.error("Error fetching carousel banners:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = { getCarouselBanner };
