const { pool } = require("../../config/database");

async function getCoupons(req, res) {
    try {
        const [coupons] = await pool.execute(`SELECT * FROM res_coupons WHERE is_active = 1`);

        return res.status(200).json({ coupons });
    } catch (error) {
//         // console.error("Error fetching coupons:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}


module.exports = { getCoupons };
