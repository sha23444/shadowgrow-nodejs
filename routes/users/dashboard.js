var express = require('express');
var router = express.Router();

const DashboardController = require('../../controllers/user/dashboard');
const authenticateUser = require('../../middlewars/authenticateToken');

router.get('/stats', authenticateUser, DashboardController.getStats);

module.exports = router;
    