var express = require('express');
var router = express.Router();

const UserController = require('../../controllers/admin/users');
const authenticateUser = require('../../middlewars/authenticateAdmin');


router.get('/',  authenticateUser, UserController.getAllUserList);
router.get('/search', authenticateUser, UserController.searchUsers);
router.get('/stats', authenticateUser, UserController.getUserStats);
router.post('/add', authenticateUser, UserController.addNewUser);
router.post('/check-username-email', authenticateUser, UserController.checkEmailOrUsername);

module.exports = router;
 
