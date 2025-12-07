const express = require('express');
const router = express.Router();
const { getUserSocialLinks } = require('../../controllers/user/socialLinks');

// Get active social links with non-null URLs
router.get('/', getUserSocialLinks);

module.exports = router;
