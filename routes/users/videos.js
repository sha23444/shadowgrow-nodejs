const express = require('express');
const router = express.Router();
const VideosController = require('../../controllers/user/videos');

router.get('/', VideosController.getVideos);
router.get('/categories', VideosController.getVideoCategories);



module.exports = router;
