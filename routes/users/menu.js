const express = require("express");
const router = express.Router();

const MenuController = require("../../controllers/user/menu");
const { smartCache } = require("../../config/smart-cache");

router.get("/", smartCache, MenuController.getMenus);

module.exports = router;
