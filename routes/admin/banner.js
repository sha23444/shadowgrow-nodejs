const express = require('express');
const router = express.Router();
const BannerController = require("../../controllers/admin/banner");
const authenticateUser = require('../../middlewars/authenticateAdmin');
const { smartCache } = require("../../config/smart-cache");

// GET routes with cache
router.get('/', authenticateUser, smartCache, BannerController.getAllBanners);
router.get('/:id', authenticateUser, smartCache, BannerController.getBannerById);

// POST, PUT, PATCH, DELETE routes without cache (will auto-clear cache)
router.post('/', authenticateUser, BannerController.createBanner);
router.put('/:id', authenticateUser, BannerController.updateBanner);
router.patch('/:id/toggle-status', authenticateUser, BannerController.toggleBannerStatus);
router.delete('/:id', authenticateUser, BannerController.deleteBanner);

module.exports = router;
