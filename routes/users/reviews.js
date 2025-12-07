var express = require('express');
var router = express.Router();

const ReviewsController = require('../../controllers/user/reviews');
const authenticateUser = require('../../middlewars/authenticateToken');


router.post('/add', authenticateUser, ReviewsController.createReview);
router.get('/', ReviewsController.getFileReviews);

module.exports = router;
 