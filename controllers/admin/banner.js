const { pool } = require("../../config/database");
const { clearBannerCache } = require("../../config/smart-cache");

const normalizeDate = value => {
    if (!value) return value;
    if (typeof value === 'string') {
        return value.slice(0, 10);
    }
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Get all banners
async function getAllBanners(req, res) {
    try {
        const [rows] = await pool.execute('SELECT * FROM banners ORDER BY created_at DESC');

        // Transform snake_case to camelCase for frontend
        const formattedBanners = rows.map(banner => ({
            id: banner.id,
            name: banner.name,
            title: banner.title,
            description: banner.description,
            ctaText: banner.cta_text,
            ctaLink: banner.cta_link,
            backgroundColor: banner.background_color,
            textColor: banner.text_color,
            accentColor: banner.accent_color,
            startDate: banner.start_date,
            endDate: banner.end_date,
            isActive: Boolean(banner.is_active),
            position: banner.position,
            image: banner.image,
            imageUrl: banner.image_url,
            createdAt: banner.created_at,
            updatedAt: banner.updated_at
        }));

        res.status(200).json(formattedBanners);
    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({ error: 'Failed to fetch banners' });
    }
}


// Get a single banner by ID
async function getBannerById(req, res) {
    try {
        const { id } = req.params;

        const [rows] = await pool.execute('SELECT * FROM banners WHERE id = ?', [id]);

        if (!rows[0]) {
            return res.status(404).json({ error: 'Banner not found' });
        }

        // Transform snake_case to camelCase for frontend
        const formattedBanner = {
            id: rows[0].id,
            name: rows[0].name,
            title: rows[0].title,
            description: rows[0].description,
            ctaText: rows[0].cta_text,
            ctaLink: rows[0].cta_link,
            backgroundColor: rows[0].background_color,
            textColor: rows[0].text_color,
            accentColor: rows[0].accent_color,
            startDate: rows[0].start_date,
            endDate: rows[0].end_date,
            isActive: Boolean(rows[0].is_active),
            position: rows[0].position,
            image: rows[0].image,
            imageUrl: rows[0].image_url,
            createdAt: rows[0].created_at,
            updatedAt: rows[0].updated_at
        };

        res.status(200).json(formattedBanner);
    } catch (error) {
        console.error('Error fetching banner:', error);
        res.status(500).json({ error: 'Failed to fetch banner' });
    }
}

// Create a new banner
async function createBanner(req, res) {
    try {
        const {
            name = '',
            title = '',
            description = '',
            ctaText = null,
            ctaLink = null,
            backgroundColor = '#FFFFFF',
            textColor = '#FFFFFF',
            accentColor = '#ff700b',
            startDate ,
            endDate,
            isActive = 1,
            position = 1,
            image = null,
            imageUrl = null
        } = req.body;

        // Validate required fields - either image file or imageUrl must be provided
        if (!image && !imageUrl) {
            return res.status(400).json({ error: 'Please upload an image or provide an image URL' });
        }

        const normalizedStartDate = normalizeDate(startDate);
        const normalizedEndDate = normalizeDate(endDate);

        // Insert banner into database
        const [result] = await pool.execute(
            `INSERT INTO banners (
        name, title, description, cta_text, cta_link, 
        background_color, text_color, accent_color, 
        start_date, end_date, is_active, position, image_url, image
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name, title, description, ctaText, ctaLink,
                backgroundColor, textColor, accentColor,
                normalizedStartDate, normalizedEndDate, isActive, position, imageUrl, image
            ]
        );

        const newBannerId = result.insertId;

        // Clear cache after creating banner
        await clearBannerCache();

        res.status(201).json({
            id: newBannerId,
            message: 'Banner created successfully'
        });
    } catch (error) {
        console.error('Error creating banner:', error);
        res.status(500).json({ error: 'Failed to create banner', error: error.message });
    }
}



// Update an existing banner
async function updateBanner(req, res) {
    try {
        const { id } = req.params;
        const {
            name,
            title,
            description,
            ctaText,
            ctaLink,
            backgroundColor,
            textColor,
            accentColor,
            startDate,
            endDate,
            isActive,
            position,
            imageUrl,
            image
        } = req.body;

        // Check if banner exists
        const [existingBanner] = await pool.execute('SELECT id FROM banners WHERE id = ?', [id]);

        if (!existingBanner) {
            return res.status(404).json({ error: 'Banner not found' });
        }

        const normalizedStartDate = normalizeDate(startDate);
        const normalizedEndDate = normalizeDate(endDate);

        // Update banner in database
        await pool.execute(
            `UPDATE banners SET
        name = ?, 
        title = ?, 
        description = ?, 
        cta_text = ?, 
        cta_link = ?, 
        background_color = ?, 
        text_color = ?, 
        accent_color = ?, 
        start_date = ?, 
        end_date = ?, 
        is_active = ?, 
        position = ?, 
        image_url = ?,
        image = ?
      WHERE id = ?`,
            [
                name, title, description, ctaText, ctaLink,
                backgroundColor, textColor, accentColor,
                normalizedStartDate, normalizedEndDate, isActive, position, imageUrl, image,
                id
            ]
        );

        // Clear cache after updating banner
        await clearBannerCache();

        res.status(200).json({
            id: parseInt(id),
            message: 'Banner updated successfully'
        });
    } catch (error) {
        console.error('Error updating banner:', error);
        res.status(500).json({ error: 'Failed to update banner' });
    }
}

// Toggle banner active status
async function toggleBannerStatus(req, res) {
    try {
        const { id } = req.params;

        // Get current status
        const [rows] = await pool.execute('SELECT is_active FROM banners WHERE id = ?', [id]);

        if (!rows[0]) {
            return res.status(404).json({ error: 'Banner not found' });
        }

        // Toggle status
        const newStatus = rows[0].is_active ? 0 : 1;

        await pool.execute('UPDATE banners SET is_active = ? WHERE id = ?', [newStatus, id]);

        // Clear cache after toggling banner status
        await clearBannerCache();

        res.status(200).json({
            id: parseInt(id),
            isActive: Boolean(newStatus),
            message: `Banner ${newStatus ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        console.error('Error toggling banner status:', error);
        res.status(500).json({ error: 'Failed to toggle banner status' });
    }
}

// Delete a banner
async function deleteBanner(req, res) {
    try {
        const { id } = req.params;

        // Check if banner exists
        const [existingBanner] = await pool.execute('SELECT id FROM banners WHERE id = ?', [id]);

        if (!existingBanner) {
            return res.status(404).json({ error: 'Banner not found' });
        }

        // Delete banner
        await pool.execute('DELETE FROM banners WHERE id = ?', [id]);

        // Clear cache after deleting banner
        await clearBannerCache();

        res.status(200).json({
            id: parseInt(id),
            message: 'Banner deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting banner:', error);
        res.status(500).json({ error: 'Failed to delete banner' });
    }
}

module.exports = {
    getAllBanners,
    getBannerById,
    createBanner,
    updateBanner,
    toggleBannerStatus,
    deleteBanner
}