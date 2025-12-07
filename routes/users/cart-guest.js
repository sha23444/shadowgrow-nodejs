const express = require('express');
const router = express.Router();
const ensureCartIdCookie = require('../../middlewars/cartId');
const authenticateUser = require('../../middlewars/authenticateToken');
const GuestCartController = require('../../controllers/user/cartGuest');

// Apply cartId middleware to all routes
router.use(ensureCartIdCookie);

router.get('/', GuestCartController.getGuestCart);
router.post('/sync', GuestCartController.syncGuestCart);
// Merge requires both cartId (from cookie) and authentication
router.post('/merge', authenticateUser, ensureCartIdCookie, GuestCartController.mergeGuestToUser);

module.exports = router;


