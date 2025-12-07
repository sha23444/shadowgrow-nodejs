var express = require('express');
var router = express.Router();
const authenticateUser = require('../../middlewars/authenticateAdmin');
const MenuController = require('../../controllers/admin/menu');
const { smartCache } = require("../../config/smart-cache");

// POST route without cache (will auto-clear cache)
router.post('/add-menus', authenticateUser, MenuController.addMenuItems);

// GET routes with cache
router.get('/get-menus', authenticateUser, smartCache, MenuController.getMenuItems);
router.get('/get-menus/:menuType', authenticateUser, smartCache, MenuController.getMenuItemsByType);
router.get('/get-pages', authenticateUser, smartCache, MenuController.getPages);
router.get('/get-blogs', authenticateUser, smartCache, MenuController.getBlogs);


module.exports = router;
