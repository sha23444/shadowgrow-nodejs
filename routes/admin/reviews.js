const express = require("express");
const router = express.Router();

const ReviewController = require("../../controllers/admin/reviews");
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.get("/", authenticateUser, ReviewController.getFileReviews);
router.put("/update", authenticateUser, ReviewController.updateReviewStatus);


module.exports = router;
