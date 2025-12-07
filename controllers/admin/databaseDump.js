const { pool } = require("../../config/database");
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Google Drive configuration
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || 'your-folder-id';
const DUMP_DIRECTORY = path.join(__dirname, '../../dumps');

// Ensure dump directory exists
if (!fs.existsSync(DUMP_DIRECTORY)) {
  fs.mkdirSync(DUMP_DIRECTORY, { recursive: true });
}

// Initialize Google Drive API
function getGoogleDriveService() {
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../../config/google-drive-credentials.json'),
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });
  
  return google.drive({ version: 'v3', auth });
}

// Create database dump
async function createDatabaseDump(req, res) {
  try {
    const { includeData = true, compress = true } = req.body;
    
    // Validate input parameters
    if (typeof includeData !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'includeData must be a boolean value'
      });
    }
    
    if (typeof compress !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'compress must be a boolean value'
      });
    }
    
    // Check if required environment variables are set
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_DATABASE) {
      return res.status(500).json({
        success: false,
        message: 'Database configuration is incomplete. Please check environment variables.'
      });
    }
    
    // Check if Google Drive folder ID is configured
    if (!process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID === 'your-folder-id') {
      return res.status(500).json({
        success: false,
        message: 'Google Drive folder ID is not configured. Please set GOOGLE_DRIVE_FOLDER_ID environment variable.'
      });
    }
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `database_dump_${timestamp}.sql`;
    const filepath = path.join(DUMP_DIRECTORY, filename);
    
    // Build mysqldump command with proper escaping
    const escapedPassword = process.env.DB_PASSWORD.replace(/"/g, '\\"');
    let command = `mysqldump -h "${process.env.DB_HOST}" -u "${process.env.DB_USER}" -p"${escapedPassword}" "${process.env.DB_DATABASE}"`;
    
    if (!includeData) {
      command += ' --no-data';
    }
    
    // Add additional options for better compatibility
    command += ' --single-transaction --routines --triggers --lock-tables=false';
    command += ` > "${filepath}"`;
    
    console.log('Executing mysqldump command...');
    
    // Execute mysqldump with timeout
    const { stdout, stderr } = await execAsync(command, { 
      timeout: 300000, // 5 minutes timeout
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    
    if (stderr && !stderr.includes('Warning')) {
      console.error('mysqldump stderr:', stderr);
    }
    
    // Check if file was created and has content
    if (!fs.existsSync(filepath)) {
      return res.status(500).json({
        success: false,
        message: 'Database dump failed - no file was created'
      });
    }
    
    const fileStats = fs.statSync(filepath);
    if (fileStats.size === 0) {
      // Clean up empty file
      fs.unlinkSync(filepath);
      return res.status(500).json({
        success: false,
        message: 'Database dump resulted in empty file. Please check database connection and permissions.'
      });
    }
    
    console.log(`Database dump created successfully: ${fileStats.size} bytes`);
    
    // Compress if requested
    let finalFilepath = filepath;
    let finalFilename = filename;
    
    if (compress) {
      const compressedFilename = filename.replace('.sql', '.sql.gz');
      const compressedFilepath = path.join(DUMP_DIRECTORY, compressedFilename);
      
      await execAsync(`gzip -c "${filepath}" > "${compressedFilepath}"`);
      
      // Remove uncompressed file
      fs.unlinkSync(filepath);
      
      finalFilepath = compressedFilepath;
      finalFilename = compressedFilename;
    }
    
    // Upload to Google Drive
    console.log('Uploading to Google Drive...');
    const driveService = getGoogleDriveService();
    const fileMetadata = {
      name: finalFilename,
      parents: [GOOGLE_DRIVE_FOLDER_ID]
    };
    
    const media = {
      mimeType: compress ? 'application/gzip' : 'application/sql',
      body: fs.createReadStream(finalFilepath)
    };
    
    let uploadedFile;
    try {
      uploadedFile = await driveService.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name,size,createdTime,webViewLink'
      });
      console.log('Upload to Google Drive successful');
    } catch (driveError) {
      // Clean up local file if Google Drive upload fails
      if (fs.existsSync(finalFilepath)) {
        fs.unlinkSync(finalFilepath);
      }
      
      console.error('Google Drive upload error:', driveError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload to Google Drive',
        error: driveError.message
      });
    }
    
    // Store dump info in database
    const [result] = await pool.execute(
      `INSERT INTO database_dumps (filename, filepath, google_drive_id, google_drive_url, file_size, created_at) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        finalFilename,
        finalFilepath,
        uploadedFile.data.id,
        uploadedFile.data.webViewLink,
        fs.statSync(finalFilepath).size
      ]
    );
    
    // Clean up local file after successful upload
    fs.unlinkSync(finalFilepath);
    
    return res.status(200).json({
      success: true,
      message: 'Database dump created and uploaded to Google Drive successfully',
      data: {
        id: result.insertId,
        filename: finalFilename,
        googleDriveId: uploadedFile.data.id,
        googleDriveUrl: uploadedFile.data.webViewLink,
        fileSize: uploadedFile.data.size,
        createdAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error creating database dump:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create database dump',
      error: error.message
    });
  }
}

// List all database dumps
async function listDatabaseDumps(req, res) {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    // Validate pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page must be a positive integer'
      });
    }
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be a positive integer between 1 and 100'
      });
    }
    
    const offset = (pageNum - 1) * limitNum;
    
    const [dumps] = await pool.execute(
      `SELECT id, filename, google_drive_id, google_drive_url, file_size, created_at 
       FROM database_dumps 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [limitNum, offset]
    );
    
    const [countResult] = await pool.execute(
      'SELECT COUNT(*) as total FROM database_dumps'
    );
    
    const total = countResult[0].total;
    const totalPages = Math.ceil(total / limitNum);
    
    return res.status(200).json({
      success: true,
      data: {
        dumps,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: total,
          itemsPerPage: limitNum
        }
      }
    });
    
  } catch (error) {
    console.error('Error listing database dumps:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to list database dumps',
      error: error.message
    });
  }
}

// Download database dump from Google Drive
async function downloadDatabaseDump(req, res) {
  try {
    const { id } = req.params;
    
    // Validate ID parameter
    const dumpId = parseInt(id);
    if (isNaN(dumpId) || dumpId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dump ID. Must be a positive integer.'
      });
    }
    
    // Get dump info from database
    const [dumps] = await pool.execute(
      'SELECT * FROM database_dumps WHERE id = ?',
      [dumpId]
    );
    
    if (dumps.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Database dump not found'
      });
    }
    
    const dump = dumps[0];
    
    // Download from Google Drive
    const driveService = getGoogleDriveService();
    
    try {
      const response = await driveService.files.get({
        fileId: dump.google_drive_id,
        alt: 'media'
      }, { responseType: 'stream' });
      
      // Set appropriate headers
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${dump.filename}"`);
      res.setHeader('Content-Length', dump.file_size);
      
      // Pipe the response to client
      response.data.pipe(res);
      
    } catch (driveError) {
      console.error('Google Drive download error:', driveError);
      return res.status(500).json({
        success: false,
        message: 'Failed to download from Google Drive',
        error: driveError.message
      });
    }
    
  } catch (error) {
    console.error('Error downloading database dump:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to download database dump',
      error: error.message
    });
  }
}

// Delete database dump
async function deleteDatabaseDump(req, res) {
  try {
    const { id } = req.params;
    
    // Validate ID parameter
    const dumpId = parseInt(id);
    if (isNaN(dumpId) || dumpId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dump ID. Must be a positive integer.'
      });
    }
    
    // Get dump info from database
    const [dumps] = await pool.execute(
      'SELECT * FROM database_dumps WHERE id = ?',
      [dumpId]
    );
    
    if (dumps.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Database dump not found'
      });
    }
    
    const dump = dumps[0];
    
    // Delete from Google Drive
    const driveService = getGoogleDriveService();
    
    try {
      await driveService.files.delete({
        fileId: dump.google_drive_id
      });
      console.log('Google Drive file deleted successfully');
    } catch (driveError) {
      console.error('Google Drive delete error:', driveError);
      // Continue with database deletion even if Google Drive deletion fails
      // This prevents orphaned database records
    }
    
    // Delete from database
    await pool.execute(
      'DELETE FROM database_dumps WHERE id = ?',
      [dumpId]
    );
    
    return res.status(200).json({
      success: true,
      message: 'Database dump deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting database dump:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete database dump',
      error: error.message
    });
  }
}

// Get database dump details
async function getDatabaseDumpDetails(req, res) {
  try {
    const { id } = req.params;
    
    // Validate ID parameter
    const dumpId = parseInt(id);
    if (isNaN(dumpId) || dumpId < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dump ID. Must be a positive integer.'
      });
    }
    
    const [dumps] = await pool.execute(
      'SELECT * FROM database_dumps WHERE id = ?',
      [dumpId]
    );
    
    if (dumps.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Database dump not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: dumps[0]
    });
    
  } catch (error) {
    console.error('Error getting database dump details:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get database dump details',
      error: error.message
    });
  }
}

// Create database dumps table if it doesn't exist
async function createDatabaseDumpsTable() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS database_dumps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        filepath VARCHAR(500) NOT NULL,
        google_drive_id VARCHAR(255) NOT NULL,
        google_drive_url TEXT,
        file_size BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_created_at (created_at),
        INDEX idx_google_drive_id (google_drive_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (error) {
    console.error('Error creating database_dumps table:', error);
  }
}

// Initialize table on module load
createDatabaseDumpsTable();

module.exports = {
  createDatabaseDump,
  listDatabaseDumps,
  downloadDatabaseDump,
  deleteDatabaseDump,
  getDatabaseDumpDetails
};
