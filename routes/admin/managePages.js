var express = require('express');
var router = express.Router();

const PageController = require('../../controllers/admin/managePages');
const authenticateUser = require('../../middlewars/authenticateAdmin');
const { smartCache } = require("../../config/smart-cache");

// GET routes with cache for reading
router.get('/', authenticateUser, smartCache, PageController.getPages);
router.get('/:id', authenticateUser, smartCache, PageController.getPageDetailsById);

// PUT, POST, DELETE routes without cache (will auto-clear cache)
router.put('/update/:id',authenticateUser, PageController.updatePage);
router.post('/create', authenticateUser, PageController.createPage);
router.delete('/delete/:id', authenticateUser, PageController.deletePage);


module.exports = router;
