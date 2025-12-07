const {
    pool
} = require("../../config/database");

async function getCurrency(req, res) {
    try {
        const [rows] = await pool.query(
            `SELECT currency_code, currency_symbol, rate, is_default FROM res_currencies WHERE status = 1 ORDER BY is_default DESC, currency_code ASC`
        );

        res.status(200).json({
            data: rows,
            status: "success",
        });
    } catch (err) {
        res.status(500).json({
            message: "Internal server error",
            status: "error",
        });
    }
}

module.exports = {
    getCurrency,
};