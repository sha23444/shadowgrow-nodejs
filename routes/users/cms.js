var express = require('express');
var router = express.Router();

const CMSController = require('../../controllers/user/cms');
const { smartCache } = require("../../config/smart-cache");

router.get('/banners', smartCache, CMSController.getCarouselBanner);


module.exports = router;
 