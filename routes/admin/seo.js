var express = require('express');
var router = express.Router();
const SEO = require('../../controllers/admin/seo');
const authenticateUser = require('../../middlewars/authenticateAdmin');

// Get all SEO data with pagination and search
router.get('/', authenticateUser, SEO.getAllSEO);

// Get available pages for SEO management
router.get('/available-pages', authenticateUser, SEO.getAvailablePages);

// Get SEO data by ID

// Get SEO data by page slug
router.get('/slug/:slug', authenticateUser, SEO.getSEOBySlug);

// Create new SEO data
router.post('/', authenticateUser, SEO.createSEO);

// Update SEO data
router.put('/:id', authenticateUser, SEO.updateSEO);

// Bulk update SEO data
router.put('/bulk/update', authenticateUser, SEO.bulkUpdateSEO);

// Toggle SEO status
router.patch('/:id/toggle-status', authenticateUser, SEO.toggleSEOStatus);

// Delete SEO data
router.delete('/:id', authenticateUser, SEO.deleteSEO);

module.exports = router;
