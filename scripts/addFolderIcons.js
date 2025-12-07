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

// Map folder names/types to download icon prompts - based on actual folder types
const folderIconPrompts = {
  // Templates
  'templates': 'Download icon for templates folder, document download symbol, blue color, modern design, square format',
  'email templates': 'Download icon for email templates folder, email envelope download symbol, blue color, modern design, square format',
  'newsletter templates': 'Download icon for newsletter templates folder, newsletter document download symbol, blue color, modern design, square format',
  'document templates': 'Download icon for document templates folder, document file download symbol, blue color, professional design, square format',
  'presentation templates': 'Download icon for presentation templates folder, presentation slide download symbol, colorful design, modern style, square format',
  'marketing emails': 'Download icon for marketing emails folder, email marketing download symbol, orange color, modern design, square format',
  
  // Resources
  'resources': 'Download icon for resources folder, file download symbol, green color, modern design, square format',
  'graphics': 'Download icon for graphics folder, image download symbol, colorful design, modern style, square format',
  'icons': 'Download icon for icons folder, icon download symbol, colorful design, modern style, square format',
  'illustrations': 'Download icon for illustrations folder, illustration download symbol, artistic design, colorful, square format',
  'stock photos': 'Download icon for stock photos folder, photo download symbol, camera theme, modern design, square format',
  'videos': 'Download icon for videos folder, video download symbol, play button theme, red color, modern design, square format',
  'tutorials': 'Download icon for tutorials folder, tutorial video download symbol, blue color, educational design, square format',
  'promotional videos': 'Download icon for promotional videos folder, promotional video download symbol, orange color, marketing design, square format',
  'audio': 'Download icon for audio folder, music download symbol, sound wave theme, blue color, modern design, square format',
  
  // Documentation
  'documentation': 'Download icon for documentation folder, document download symbol, blue color, professional design, square format',
  'user guides': 'Download icon for user guides folder, guide book download symbol, blue color, educational design, square format',
  'api documentation': 'Download icon for API documentation folder, API code download symbol, dark blue color, technical design, square format',
  'technical docs': 'Download icon for technical docs folder, technical document download symbol, gray color, professional design, square format',
  
  // Software
  'software': 'Download icon for software folder, software application download symbol, blue color, tech design, square format',
  'desktop': 'Download icon for desktop folder, desktop application download symbol, blue color, modern design, square format',
  
  // Mobile Firmware (from demo data)
  'mobile firmware': 'Download icon for mobile firmware folder, smartphone download symbol, purple color, tech design, square format',
  'samsung firmware': 'Download icon for Samsung firmware folder, Samsung device download symbol, blue color, modern design, square format',
  'flashing tools': 'Download icon for flashing tools folder, tool download symbol, orange color, technical design, square format',
  'recovery files': 'Download icon for recovery files folder, recovery download symbol, red color, technical design, square format',
  'default': 'Download icon for folder, download symbol, folder icon theme, blue color, modern design, square format'
};

// Function to get icon prompt for a folder
function getIconPrompt(folderTitle) {
  const titleLower = folderTitle.toLowerCase().trim();
  
  // Check for exact matches first
  if (folderIconPrompts[titleLower]) {
    return folderIconPrompts[titleLower];
  }
  
  // Check for partial matches (folder name contains keyword)
  for (const [key, prompt] of Object.entries(folderIconPrompts)) {
    if (titleLower.includes(key)) {
      return prompt;
    }
  }
  
  // Default prompt - simple download icon (generic for all folders)
  return `Download icon, download arrow symbol pointing down, blue color, modern minimalist design, square format, clean white background, simple and clean`;
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

// Function to generate icon using OpenAI DALL-E
async function generateIcon(prompt, folderName) {
  try {
    console.log(`\n🎨 Generating icon for "${folderName}"...`);
    console.log(`   Prompt: ${prompt.substring(0, 100)}...`);
    
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
    console.error(`   ❌ Error generating icon for "${folderName}":`, error.message);
    throw error;
  }
}

// Function to update folder thumbnail in database
async function updateFolderThumbnail(connection, folderId, filename) {
  try {
    const query = 'UPDATE res_folders SET thumbnail = ? WHERE folder_id = ?';
    await connection.execute(query, [filename, folderId]);
    console.log(`   ✅ Updated database for folder ID: ${folderId}`);
  } catch (error) {
    console.error(`   ❌ Error updating database for folder ID ${folderId}:`, error.message);
    throw error;
  }
}

async function addFolderIcons() {
  let connection;
  
  try {
    console.log('🎨 Starting to add folder icons...\n');
    
    connection = await pool.getConnection();
    
    // Create folders directory if it doesn't exist
    const foldersDir = path.join(__dirname, '../public/media/folders');
    if (!fs.existsSync(foldersDir)) {
      fs.mkdirSync(foldersDir, { recursive: true });
      console.log(`📁 Created directory: ${foldersDir}\n`);
    }
    
    // Fetch all folders from database that need icons (NULL or empty thumbnail)
    console.log('📂 Fetching folders from database...\n');
    const [folders] = await connection.execute(`
      SELECT folder_id, title, thumbnail 
      FROM res_folders 
      WHERE is_active = 1 
      AND (thumbnail IS NULL OR thumbnail = '')
      ORDER BY folder_id ASC
    `);
    
    console.log(`Found ${folders.length} folders that need icons\n`);
    
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    
    // Process each folder
    for (const folder of folders) {
      try {
        // Double check - skip if somehow has a thumbnail
        if (folder.thumbnail && folder.thumbnail.trim() !== '') {
          console.log(`⏭️  Skipping "${folder.title}" - already has thumbnail: ${folder.thumbnail}`);
          skipped++;
          continue;
        }
        
        // Get icon prompt for this folder
        const prompt = getIconPrompt(folder.title);
        
        // Generate icon
        const iconUrl = await generateIcon(prompt, folder.title);
        
        // Create filename from folder title
        const filename = `${folder.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${folder.folder_id}.jpg`;
        const filepath = path.join(foldersDir, filename);
        
        // Download and save locally
        console.log(`   💾 Downloading to: ${filepath}`);
        await downloadImage(iconUrl, filepath);
        console.log(`   ✅ Saved locally: ${filename}`);
        
        // Update database with filename only
        await updateFolderThumbnail(connection, folder.folder_id, filename);
        
        processed++;
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`   ⚠️  Skipping "${folder.title}" due to error:`, error.message);
        errors++;
        continue;
      }
    }
    
    console.log('\n🎉 Successfully processed folder icons!\n');
    console.log('📊 Statistics:');
    console.log(`   Total Folders: ${folders.length}`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Skipped (already had icons): ${skipped}`);
    console.log(`   Errors: ${errors}\n`);
    
    // Show sample of updated folders
    const [updatedFolders] = await connection.execute(`
      SELECT folder_id, title, thumbnail 
      FROM res_folders 
      WHERE thumbnail IS NOT NULL AND thumbnail != ''
      ORDER BY folder_id DESC
      LIMIT 10
    `);
    
    console.log('📸 Sample Updated Folders:');
    updatedFolders.forEach((folder, index) => {
      console.log(`   ${index + 1}. ${folder.title} - ${folder.thumbnail}`);
    });
    
  } catch (error) {
    console.error('❌ Error adding folder icons:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Run the function
addFolderIcons()
  .then(() => {
    console.log('\n✅ Folder icons addition completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Folder icons addition failed:', error);
    process.exit(1);
  });

 