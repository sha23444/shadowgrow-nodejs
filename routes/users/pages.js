var express = require('express');
var router = express.Router();

const PagesController = require('../../controllers/user/pages');
const { smartCache } = require("../../config/smart-cache");

// GET route with cache
router.get('/:slug', smartCache, PagesController.getPages);

module.exports = router;