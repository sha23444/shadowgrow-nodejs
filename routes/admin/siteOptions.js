const express = require('express');
const router = express.Router();

const SiteOptionsController = require('../../controllers/admin/siteOptions');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.get('/', authenticateUser, SiteOptionsController.getAllOptions);
router.put('/update', authenticateUser, SiteOptionsController.updateOption);
router.post('/add', authenticateUser, SiteOptionsController.addOption);


module.exports = router;
