var express = require('express');
var router = express.Router();
const SocialPlatform = require('../../controllers/admin/socialPlatform');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.post('/create', authenticateUser, SocialPlatform.createSocialPlatform);
router.get('/', authenticateUser, SocialPlatform.getSocialPlatforms);
router.delete('/delete/:id', authenticateUser, SocialPlatform.deleteSocialPlatform);
router.put('/update/:id', authenticateUser, SocialPlatform.updateSocialPlatform);

module.exports = router;
