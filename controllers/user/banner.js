const { pool } = require("../../config/database");

async function getActiveBanners(req, res) {
    try {
        const currentDate = new Date().toISOString().split('T')[0];

        const [rows] = await pool.execute(
            'SELECT * FROM banners WHERE is_active = ? AND start_date <= ? AND end_date >= ? ORDER BY created_at DESC',
            [true, currentDate, currentDate]
        );

        res.status(200).json(rows);
    } catch (error) {
//         // console.error('Error fetching active banners:', error);
        res.status(500).json({ error: 'Failed to fetch active banners' });
    }
}

module.exports = {
    getActiveBanners,
   
}