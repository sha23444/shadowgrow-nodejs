const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: function (req, file, callback) {

    const fieldname = file.fieldname;
    const folderPath = path.join("public", "media", fieldname);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    callback(null, folderPath);
  },
  filename: function (req, file, callback) {
    callback(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  limits: {
    // fileSize: 100 * 1024 * 1024, // 100 MB upload limit - REMOVED
    // files: 1                    // 1 file
  },
  fileFilter: (req, file, cb) => {
    // if the file extension is in our accepted list
    if (
      mimeTypes.allowed_image_mimes.some((ext) =>
        file.originalname.endsWith("." + ext)
      )
    ) {
      return cb(null, true);
    }
    // otherwise, return error
    return cb(new Error("file not allowed"));
  },
  storage: storage, //storage
});

const mimeTypes = {
  allowed_image_mimes: [
    "jpeg",
    "png",
    "bmp",
    "jpg",
    "webp",
    "svg",
    "JPG",
    "pdf",
    "docx",
    "ico",
    "mp4",
    "mov",
    "avi",
    "wmv",
    "flv",
    "webm",
    "mp3",
    "ogg",
    "wav",
    "m4a",
    "m4v",
    "m4b",
    "m4p",
    "m4v",
    "gif"
  ],
};

class FileUpload {
  constructor() {
    this.files = this.files.bind(this);
  }
  files(filesArray) {
    try {
      let files = filesArray.map((file) => {
        return {
          name: file,
          maxCount: 1,
        };
      });
      const uploadable = upload.fields(files);
      return (req, res, next) => {
        uploadable(req, res, function (err) {
          console.log(err, "Error in fileUpload");
          req.uploadError = err;
          if (err) {
            // Handle specific Multer errors with proper error messages
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
              return res.status(400).json({
                status: 'fail',
                message: `Unexpected field '${err.field}'. Allowed fields are: ${filesArray.join(', ')}`,
                error: 'INVALID_FIELD_NAME'
              });
            }
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(400).json({
                status: 'fail',
                message: 'File size too large',
                error: 'FILE_TOO_LARGE'
              });
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
              return res.status(400).json({
                status: 'fail',
                message: 'Too many files uploaded',
                error: 'TOO_MANY_FILES'
              });
            }
            if (err.message === 'file not allowed') {
              return res.status(400).json({
                status: 'fail',
                message: 'File type not allowed',
                error: 'INVALID_FILE_TYPE'
              });
            }
            // Generic error handler
            return res.status(400).json({
              status: 'fail',
              message: err.message || 'File upload error',
              error: 'UPLOAD_ERROR'
            });
          }
          next();
        });
      };
    } catch (e) {
      console.log(e, "Error at fileUploads");
      return e;
    }
  }

  arrayUpload(name) {
    return upload.array(name);
  }
}

module.exports = new FileUpload();
