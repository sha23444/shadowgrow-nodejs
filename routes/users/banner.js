const express = require('express');
const router = express.Router();
const BannerController = require("../../controllers/user/banner");
const { smartCache } = require("../../config/smart-cache");


// Banner routes
router.get('/', smartCache, BannerController.getActiveBanners);

module.exports = router;
