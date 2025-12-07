const _ = require('lodash');
/* Third Party Libraries */

/* End Models */

class FilesController {

    expectedFiles() {
        return [
            'avatar',
            'documents',    
            'image',
            'photo',
            'folders',
            'files',
            'blogs',
            'teams',
            'icons',
            'agents',
            'products',
            'banners',
            'users',
            'site',
            'payment-gateway',
            'services'
        ]
    }

    async uploadFiles(req, res) {
        try {
            // Check if there was an upload error from multer middleware
            if (req.uploadError) {
                return res.status(400).json({
                    status: 'fail',
                    message: req.uploadError.message || 'File upload error',
                    error: 'UPLOAD_ERROR'
                });
            }

            if (!req['files'] || _.isEmpty(req['files'])) {
                return res.status(400).json({
                    status: 'fail',
                    message: 'No files uploaded. Please select files to upload.',
                    error: 'NO_FILES'
                });
            }

            const files = Object.keys(req.files)
                .map(key => {
                    console.log(req.files[key])
                    return {
                        [key]: req.files[key].map(file => file.filename)
                    };
                    // For local storage
                    // return {
                    //     [key]: req.files[key].map(file => file.location)
                    // }; // For S3 Storage
                })
                .reduce((prev, curr) => {
                    return {...prev, ...curr }
                });
            
            res.status(200).json({
                status: 'success',
                message: 'Files uploaded successfully',
                response: files,
            })
        } catch (e) {
            console.error('Error in uploadFiles:', e);
            res.status(500).json({
                status: 'fail',
                message: 'Internal server error during file upload',
                error: 'INTERNAL_ERROR'
            })  
        }
    }
}

module.exports = new FilesController();