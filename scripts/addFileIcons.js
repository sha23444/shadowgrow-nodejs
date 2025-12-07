const { pool } = require('../config/database');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: 'YOUR_OPENAI_API_KEY_HERE'
});

// Function to check if thumbnail is a URL
function isUrl(thumbnail) {
  if (!thumbnail || thumbnail.trim() === '') return false;
  return thumbnail.startsWith('http://') || thumbnail.startsWith('https://');
}

// Function to download image from URL
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200 || response.statusCode === 301 || response.statusCode === 302) {
        if (response.statusCode === 301 || response.statusCode === 302) {
          return downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
        }
        
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(filepath);
        });
        fileStream.on('error', reject);
      } else {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

// Function to generate download icon using OpenAI DALL-E
async function generateIcon(fileTitle) {
  try {
    console.log(`\n🎨 Generating download icon for "${fileTitle}"...`);
    
    const prompt = `Download icon, download arrow symbol pointing down, blue color, modern minimalist design, square format, clean white background, simple and clean`;
    
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "url"
    });

    const imageUrl = response.data[0].url;
    console.log(`   ✅ Generated: ${imageUrl}`);
    
    return imageUrl;
  } catch (error) {
    console.error(`   ❌ Error generating icon for "${fileTitle}":`, error.message);
    throw error;
  }
}

// Function to update file thumbnail in database
async function updateFileThumbnail(connection, fileId, filename) {
  try {
    const query = 'UPDATE res_files SET thumbnail = ? WHERE file_id = ?';
    await connection.execute(query, [filename, fileId]);
    console.log(`   ✅ Updated database for file ID: ${fileId}`);
  } catch (error) {
    console.error(`   ❌ Error updating database for file ID ${fileId}:`, error.message);
    throw error;
  }
}

async function addFileIcons() {
  let connection;
  
  try {
    console.log('🎨 Starting to add file icons...\n');
    
    connection = await pool.getConnection();
    
    // Create files directory if it doesn't exist
    const filesDir = path.join(__dirname, '../public/media/files');
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
      console.log(`📁 Created directory: ${filesDir}\n`);
    }
    
    // Fetch ALL active files to replace thumbnails with download icons
    console.log('📂 Fetching all active files from database...\n');
    const [files] = await connection.execute(`
      SELECT file_id, title, thumbnail 
      FROM res_files 
      WHERE is_active = 1
      ORDER BY downloads DESC
    `);
    
    console.log(`Found ${files.length} active files to process\n`);
    
    if (files.length === 0) {
      console.log('⚠️  No active files found!\n');
      return;
    }
    
    // Count files with URLs
    const filesWithUrls = files.filter(f => isUrl(f.thumbnail));
    console.log(`   📊 Files with URL thumbnails: ${filesWithUrls.length}`);
    console.log(`   📊 Files with local thumbnails: ${files.length - filesWithUrls.length}`);
    console.log(`   📊 Files with NULL/empty thumbnails: ${files.filter(f => !f.thumbnail || f.thumbnail.trim() === '').length}\n`);
    
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    let urlRemoved = 0;
    
    // Generate a single generic download icon to reuse for all files
    console.log('🎨 Generating generic download icon...\n');
    let genericIconUrl;
    let genericIconPath;
    
    try {
      // Add timeout for icon generation (30 seconds)
      const iconGenerationPromise = generateIcon('download');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Icon generation timeout after 30s')), 30000)
      );
      
      genericIconUrl = await Promise.race([iconGenerationPromise, timeoutPromise]);
      const genericFilename = 'download-icon.jpg';
      genericIconPath = path.join(filesDir, genericFilename);
      
      // Add timeout for download (20 seconds)
      const downloadPromise = downloadImage(genericIconUrl, genericIconPath);
      const downloadTimeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Download timeout after 20s')), 20000)
      );
      
      await Promise.race([downloadPromise, downloadTimeoutPromise]);
      console.log(`✅ Generated and saved generic icon: ${genericFilename}\n`);
    } catch (error) {
      console.error('❌ Failed to generate generic icon, will copy existing or skip:', error.message);
      genericIconPath = null;
      
      // Try to use an existing download icon if available
      const existingIcon = path.join(filesDir, 'download-icon.jpg');
      if (fs.existsSync(existingIcon)) {
        console.log('📋 Using existing download-icon.jpg\n');
        genericIconPath = existingIcon;
      }
    }
    
    // Process each file
    const totalFiles = files.length;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progress = `[${i + 1}/${totalFiles}]`;
      
      try {
        // Check if thumbnail is a URL - if so, we need to replace it
        const hasUrl = isUrl(file.thumbnail);
        
        if (hasUrl) {
          console.log(`${progress} 🔄 Replacing URL thumbnail for "${file.title}"`);
          urlRemoved++;
        } else {
          console.log(`${progress} ➕ Adding icon for "${file.title}"`);
        }
        
        // Use generic icon if available, otherwise generate one
        let iconUrl;
        if (genericIconPath && fs.existsSync(genericIconPath)) {
          // Copy the generic icon for this file
          const filename = `file-${file.file_id}.jpg`;
          const filepath = path.join(filesDir, filename);
          fs.copyFileSync(genericIconPath, filepath);
          console.log(`   ✅ Copied generic icon: ${filename}`);
          
          // Update database with filename only
          await updateFileThumbnail(connection, file.file_id, filename);
          processed++;
        } else {
          // Generate unique icon for this file
          iconUrl = await generateIcon(file.title);
          
          // Create filename from file title
          const filename = `${file.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${file.file_id}.jpg`;
          const filepath = path.join(filesDir, filename);
          
          // Download and save locally
          console.log(`   💾 Downloading to: ${filepath}`);
          await downloadImage(iconUrl, filepath);
          console.log(`   ✅ Saved locally: ${filename}`);
          
          // Update database with filename only (removing URL if present)
          await updateFileThumbnail(connection, file.file_id, filename);
          
          processed++;
          
          // Add a small delay to avoid rate limiting (only when generating)
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`   ⚠️  ${progress} Skipping "${file.title}" due to error:`, error.message);
        errors++;
        continue;
      }
    }
    
    console.log('\n🎉 Successfully processed file icons!\n');
    console.log('📊 Statistics:');
    console.log(`   Total Files: ${files.length}`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Skipped (already had local icons): ${skipped}`);
    console.log(`   URLs Removed: ${urlRemoved}`);
    console.log(`   Errors: ${errors}\n`);
    
    // Show sample of updated files
    const [updatedFiles] = await connection.execute(`
      SELECT file_id, title, thumbnail 
      FROM res_files 
      WHERE thumbnail IS NOT NULL AND thumbnail != '' 
      AND thumbnail NOT LIKE 'http%'
      ORDER BY downloads DESC
      LIMIT 10
    `);
    
    console.log('📸 Sample Updated Files:');
    updatedFiles.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file.title} - ${file.thumbnail}`);
    });
    
  } catch (error) {
    console.error('❌ Error adding file icons:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Run the function
addFileIcons()
  .then(() => {
    console.log('\n✅ File icons addition completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ File icons addition failed:', error);
    process.exit(1);
  });

