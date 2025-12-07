const express = require('express');
const router = express.Router();

const VideoController = require('../../controllers/admin/videos');
const VideoCategoryController = require('../../controllers/admin/videoCategories');

router.post('/create', VideoController.createYouTubeVideo);
router.get('/list', VideoController.getAllYouTubeVideos);
router.put('/update/:videoId', VideoController.updateYouTubeVideo);
router.delete('/delete/:videoId', VideoController.deleteYouTubeVideo);

router.post('/category/create', VideoCategoryController.createVideoCategory);
router.get('/category', VideoCategoryController.getAllVideoCategories);
router.delete('/category/delete/:categoryId', VideoCategoryController.deleteVideoCategory);


module.exports = router;
