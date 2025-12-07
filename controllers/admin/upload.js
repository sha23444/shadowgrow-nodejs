const path = require("path");
const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } = require('@aws-sdk/client-s3');
const multer = require("multer");
const BunnyService = require("../../services/BunnyService");
require("dotenv").config();

// Configure S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

// Initialize Multipart Upload
const initiateMultipartUpload = async (fileName, mimeType) => {
  const command = new CreateMultipartUploadCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: `videos/${fileName}`,
    ContentType: mimeType,
  });
  const response = await s3.send(command);
  return response.UploadId;
};

// Upload a Part
const uploadPart = async (uploadId, fileName, partNumber, chunk) => {
  const command = new UploadPartCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: `videos/${fileName}`,
    PartNumber: partNumber,
    UploadId: uploadId,
    Body: chunk,
  });
  const response = await s3.send(command);
  return response.ETag;
};

// Complete Multipart Upload
const completeMultipartUpload = async (uploadId, fileName, parts) => {
  const command = new CompleteMultipartUploadCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: `videos/${fileName}`,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts,
    },
  });
  const response = await s3.send(command);
  return response;
};

// Abort Multipart Upload
const abortMultipartUpload = async (uploadId, fileName) => {
  const command = new AbortMultipartUploadCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: `videos/${fileName}`,
    UploadId: uploadId,
  });
  await s3.send(command);
};

// Chunked Upload Controller
const chunkUpload = async (req, res) => {
  try {
    const { fileName, mimeType, uploadId, partNumber, totalParts } = req.body;
    const chunk = req.file.buffer;

    if (!fileName || !mimeType || !partNumber || !chunk || !totalParts) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    // If it's the first chunk, initiate a multipart upload
    let uploadResponse;
    if (partNumber === 1) {
      const uploadId = await initiateMultipartUpload(fileName, mimeType);
      uploadResponse = { uploadId };
    } else {
      uploadResponse = { uploadId };
    }

    // Upload the chunk
    const etag = await uploadPart(
      uploadResponse.uploadId,
      fileName,
      partNumber,
      chunk
    );  

    // If it's the last part, complete the upload
    if (partNumber === totalParts) {
      const partsArray = [...Array(totalParts).keys()].map((_, index) => ({
        ETag: etag,
        PartNumber: index + 1,
      }));

      await completeMultipartUpload(uploadResponse.uploadId, fileName, partsArray);
      return res.status(200).json({ message: "Upload complete" });
    }

    // Return the upload ID for subsequent chunks
    res.status(200).json({
      uploadId: uploadResponse.uploadId,
      message: "Chunk uploaded successfully",
    });
  } catch (error) {
    // Abort upload in case of an error
    if (req.body.uploadId) {
      await abortMultipartUpload(req.body.uploadId, req.body.fileName);
    }
    res.status(500).json({ error: "Failed to upload chunk", details: error.message });
  }
};

// Upload video (Simple Upload) - Supports both S3 and Bunny.net
const uploadVideo = (req, res) => {
  const upload = multer().single('file');
  upload(req, res, async (err) => {
    if (err) {
      return res
        .status(400)
        .json({ error: "File upload failed", details: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const fileName = Date.now() + path.extname(req.file.originalname);
    const useBunny = req.query.provider === 'bunny' || req.body.provider === 'bunny';

    // Use Bunny.net if requested and configured
    if (useBunny) {
      try {
        await BunnyService.loadCredentials();
        const result = await BunnyService.uploadVideoBuffer(
          req.file.buffer,
          fileName,
          {
            contentType: req.file.mimetype,
            folder: 'courses', // Store course videos in courses folder
          }
        );
        return res.status(200).json({
          message: "Video uploaded successfully to Bunny.net",
          url: result.url,
          provider: 'bunny',
          fileName: result.fileName,
        });
      } catch (bunnyError) {
        // Fallback to S3 if Bunny.net fails
        console.error('Bunny.net upload failed, falling back to S3:', bunnyError);
      }
    }

    // Default to S3 upload
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `videos/${fileName}`,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    try {
      const data = await s3.send(new UploadPartCommand(params));
      res.status(200).json({
        message: "Video uploaded successfully",
        url: data.Location,
        provider: 's3',
        fileName: fileName,
      });
    } catch (uploadError) {
      res
        .status(500)
        .json({ error: "Failed to upload video", details: uploadError.message });
    }
  });
};

// Generate pre-signed URL
const generatePreSignedUrl = async (req, res) => {
  const { fileName } = req.query;

  if (!fileName) {
    return res.status(400).json({ error: "fileName is required" });
  }

  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: `videos/${fileName}`,
    Expires: 60 * 5,
  };

  try {
    const url = await s3.getSignedUrlPromise("getObject", params);
    res.status(200).json({ url });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to generate pre-signed URL", details: error.message });
  }
};

// List videos
const listVideos = async (req, res) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Prefix: "videos/",
  };

  try {
    const data = await s3.send(new ListObjectsV2Command(params));
    const videoList = data.Contents.map((item) => ({
      key: item.Key,
      lastModified: item.LastModified,
      size: item.Size,
    }));
    res.status(200).json({ videos: videoList });
  } catch (error) {
    res.status(500).json({ error: "Failed to list videos", details: error.message });
  }
};

// Delete video
const deleteVideo = async (req, res) => {
  const { fileName } = req.body;

  if (!fileName) {
    return res.status(400).json({ error: "fileName is required" });
  }

  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: `videos/${fileName}`,
  };

  try {
    await s3.send(new DeleteObjectCommand(params));
    res.status(200).json({ message: "Video deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete video", details: error.message });
  }
};

// Upload video to Bunny.net Stream (with transcoding)
const uploadVideoToBunnyStream = (req, res) => {
  const upload = multer().single('file');
  upload(req, res, async (err) => {
    if (err) {
      return res
        .status(400)
        .json({ error: "File upload failed", details: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      await BunnyService.loadCredentials();
      
      // Save file temporarily
      const fs = require('fs');
      const tempPath = path.join(__dirname, '../../temp', `temp_${Date.now()}_${req.file.originalname}`);
      const tempDir = path.dirname(tempPath);
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      fs.writeFileSync(tempPath, req.file.buffer);

      const result = await BunnyService.uploadVideoToStream(
        tempPath,
        req.file.originalname,
        {
          title: req.body.title || req.file.originalname,
          collectionId: req.body.collectionId || null,
        }
      );

      // Clean up temp file
      fs.unlinkSync(tempPath);

      res.status(200).json({
        message: "Video uploaded successfully to Bunny.net Stream",
        provider: 'bunny-stream',
        videoId: result.videoId,
        embedUrl: result.embedUrl,
        playbackUrl: result.playbackUrl,
        thumbnailUrl: result.thumbnailUrl,
        title: result.title,
        duration: result.duration,
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to upload to Bunny.net Stream",
        details: error.message,
      });
    }
  });
};

module.exports = {
  uploadVideo,
  generatePreSignedUrl,
  listVideos,
  deleteVideo,
  chunkUpload,
  uploadVideoToBunnyStream,
};
