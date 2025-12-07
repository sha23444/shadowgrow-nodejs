var express = require('express');
var router = express.Router();
const SocialLinks = require('../../controllers/admin/socialLinks');
const authenticateUser = require('../../middlewars/authenticateAdmin');

// Get all social links with pagination
router.get('/', authenticateUser, SocialLinks.getSocialLinks);

// Update a social link
router.put('/update', authenticateUser, SocialLinks.updateSocialLink);


module.exports = router;
