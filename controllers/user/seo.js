const { pool } = require("../../config/database");

// Get SEO data by page slug for frontend
async function getSEOData(req, res) {
  try {

    const [seoResult] = await pool.execute(
      'SELECT * FROM res_seo' 
    );
  
    return res.status(200).json({
//       success: true,
//       data: seoResult
    });
  } catch (error) {
//     // console.error("Error fetching SEO data by slug:", error);
    return res.status(500).json({
//       success: false,
//       error: "Internal Server Error"
    });
  }
}


module.exports = {
  getSEOData,
};
