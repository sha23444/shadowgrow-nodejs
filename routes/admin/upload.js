const express = require("express");
const router = express.Router();
const authenticateAdmin = require("../../middlewars/authenticateAdmin");
const uploadController = require("../../controllers/admin/upload");

// Route for uploading a video (supports both S3 and Bunny.net)
router.post("/video", authenticateAdmin, uploadController.uploadVideo);

// Route for uploading a video to Bunny.net Stream (with transcoding)
router.post("/video/bunny-stream", authenticateAdmin, uploadController.uploadVideoToBunnyStream);

router.post("/video/chunk", authenticateAdmin, uploadController.chunkUpload);

// Route for generating a pre-signed URL for a video
router.get("/video/presigned", authenticateAdmin, uploadController.generatePreSignedUrl);

// Route for listing videos
router.get("/videos", authenticateAdmin, uploadController.listVideos);

// Route for deleting a video
router.delete("/video", authenticateAdmin, uploadController.deleteVideo);

module.exports = router;
