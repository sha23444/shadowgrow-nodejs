/* eslint-disable no-console */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { pool } = require("../config/database");
const fs = require("fs");
const path = require("path");
const slugify = require("slugify");

// Load demo data
const demoDataPath = path.resolve(__dirname, "demo-data.json");
const demoData = JSON.parse(fs.readFileSync(demoDataPath, "utf8"));

// Folder map to track created folders by path
const folderMap = new Map();

function slugifyTitle(title) {
  return slugify(title, {
    lower: true,
    replacement: '-',
    remove: /[*+~.()'"!:@]/g,
  });
}

async function createFolder(connection, title, parentId, description = '', isActive = 1, isNew = 1) {
  const slug = slugifyTitle(title);
  
  // Generate unique slug
  let uniqueSlug = slug;
  let counter = 1;
  while (true) {
    const [slugRows] = await connection.query(
      `SELECT folder_id FROM res_folders WHERE slug = ? AND parent_id = ?`,
      [uniqueSlug, parentId]
    );
    if (slugRows.length === 0) break;
    uniqueSlug = `${slug}-${counter++}`;
  }
  
  const [result] = await connection.query(
    `INSERT INTO res_folders (title, parent_id, description, thumbnail, is_active, is_new, slug)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [title, parentId, description, null, isActive, isNew, uniqueSlug]
  );
  
  return result.insertId;
}

async function processFolders(connection, folders, parentId = 0, pathArray = []) {
  for (const folder of folders) {
    const currentPath = [...pathArray, folder.title];
    const pathKey = currentPath.join('/');
    
    // Check if folder already exists
    if (folderMap.has(pathKey)) {
      console.log(`⏭️  Skipping folder (already exists): ${pathKey}`);
      continue;
    }
    
    const folderId = await createFolder(
      connection,
      folder.title,
      parentId,
      folder.description || '',
      folder.is_active !== undefined ? folder.is_active : 1,
      folder.is_new !== undefined ? folder.is_new : 1
    );
    
    folderMap.set(pathKey, folderId);
    console.log(`✅ Created folder: ${pathKey} (ID: ${folderId})`);
    
    // Process children recursively
    if (folder.children && folder.children.length > 0) {
      await processFolders(connection, folder.children, folderId, currentPath);
    }
  }
}

async function findFolderByPath(connection, folderPath) {
  const pathKey = folderPath.join('/');
  
  if (folderMap.has(pathKey)) {
    return folderMap.get(pathKey);
  }
  
  // Try to find in database
  let currentParentId = 0;
  for (let i = 0; i < folderPath.length; i++) {
    const folderName = folderPath[i];
    const [rows] = await connection.query(
      `SELECT folder_id FROM res_folders WHERE title = ? AND parent_id = ? LIMIT 1`,
      [folderName, currentParentId]
    );
    
    if (rows.length === 0) {
      console.warn(`⚠️  Folder not found in path: ${folderPath.join(' > ')}`);
      return 0; // Root folder
    }
    
    currentParentId = rows[0].folder_id;
  }
  
  folderMap.set(pathKey, currentParentId);
  return currentParentId;
}

async function createFile(connection, fileData, folderId) {
  // Check if file exists
  const [existing] = await connection.query(
    `SELECT file_id FROM res_files WHERE title = ? AND folder_id = ?`,
    [fileData.title, folderId]
  );
  
  if (existing.length > 0) {
    console.log(`⏭️  Skipping file (already exists): ${fileData.title}`);
    return existing[0].file_id;
  }
  
  // Generate unique slug
  const baseSlug = slugifyTitle(fileData.title);
  let uniqueSlug = baseSlug;
  let counter = 1;
  while (true) {
    const [slugRows] = await connection.query(
      `SELECT file_id FROM res_files WHERE slug = ? AND folder_id = ?`,
      [uniqueSlug, folderId]
    );
    if (slugRows.length === 0) break;
    uniqueSlug = `${baseSlug}-${counter++}`;
  }
  
  const price = fileData.price || "0.00";
  const isFeatured = fileData.is_featured ? 1 : 0;
  const isNew = fileData.is_new !== undefined ? (fileData.is_new ? 1 : 0) : 1;
  const isActive = fileData.is_active !== undefined ? (fileData.is_active ? 1 : 0) : 1;
  
  const [result] = await connection.query(
    `INSERT INTO res_files 
     (folder_id, title, slug, description, body, thumbnail, image, size, price, url, url_type, is_active, is_new, is_featured, password, meta_title, meta_description, meta_keywords)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      folderId,
      fileData.title,
      uniqueSlug,
      fileData.description || '',
      null,
      fileData.thumbnail || null,
      fileData.thumbnail || null,
      fileData.size || 0,
      price,
      fileData.url || '',
      fileData.url_type || 'direct',
      isActive,
      isNew,
      isFeatured,
      null,
      fileData.title,
      fileData.description || null,
      fileData.tags ? fileData.tags.join(', ') : null
    ]
  );
  
  const fileId = result.insertId;
  
  // Handle tags if provided
  if (fileData.tags && Array.isArray(fileData.tags) && fileData.tags.length > 0) {
    for (const tagName of fileData.tags) {
      // Check if tag exists
      const [existingTag] = await connection.query(
        `SELECT id FROM tags WHERE tag = ?`,
        [tagName]
      );
      
      let tagId;
      if (existingTag.length > 0) {
        tagId = existingTag[0].id;
      } else {
        const [tagResult] = await connection.query(
          `INSERT INTO tags (tag) VALUES (?)`,
          [tagName]
        );
        tagId = tagResult.insertId;
      }
      
      // Check if mapping exists
      const [existingMapping] = await connection.query(
        `SELECT tag_id FROM tag_map WHERE tag_id = ? AND ref_id = ? AND ref_type = 'file'`,
        [tagId, fileId]
      );
      
      if (existingMapping.length === 0) {
        await connection.query(
          `INSERT INTO tag_map (tag_id, ref_id, ref_type) VALUES (?, ?, ?)`,
          [tagId, fileId, 'file']
        );
      }
    }
  }
  
  return fileId;
}

async function seedDemoData() {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    console.log('🚀 Starting demo data seeding...\n');
    console.log(`📁 Found ${demoData.folders.length} root folders`);
    console.log(`📄 Found ${demoData.files.length} files\n`);
    
    // Step 1: Create all folders
    console.log('📂 Creating folders...\n');
    await processFolders(connection, demoData.folders, 0, []);
    
    console.log(`\n✅ Created ${folderMap.size} folders\n`);
    
    // Step 2: Create all files
    console.log('📄 Creating files...\n');
    let filesCreated = 0;
    let filesSkipped = 0;
    
    for (const file of demoData.files) {
      try {
        const folderId = await findFolderByPath(connection, file.folder_path);
        
        if (folderId === 0 && file.folder_path.length > 0) {
          console.warn(`⚠️  Could not find folder for: ${file.title} (path: ${file.folder_path.join(' > ')})`);
          filesSkipped++;
          continue;
        }
        
        const fileId = await createFile(connection, file, folderId);
        
        const priceText = parseFloat(file.price || 0) === 0 ? 'FREE' : `$${file.price}`;
        const featuredText = file.is_featured ? ' [FEATURED]' : '';
        const newText = file.is_new ? ' [NEW]' : '';
        
        console.log(`✅ Created file: ${file.title} - ${priceText}${featuredText}${newText} (ID: ${fileId})`);
        filesCreated++;
      } catch (error) {
        console.error(`❌ Error creating file ${file.title}:`, error.message);
        filesSkipped++;
      }
    }
    
    await connection.commit();
    
    console.log(`\n🎉 Successfully seeded demo data!`);
    console.log(`\n📊 Summary:`);
    console.log(`   - Folders created: ${folderMap.size}`);
    console.log(`   - Files created: ${filesCreated}`);
    console.log(`   - Files skipped: ${filesSkipped}`);
    console.log(`   - Total files processed: ${demoData.files.length}`);
    
    // Display statistics
    const [folderStats] = await connection.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_new = 1 THEN 1 ELSE 0 END) as new_folders
      FROM res_folders
    `);
    
    const [fileStats] = await connection.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_new = 1 THEN 1 ELSE 0 END) as new_files,
        SUM(CASE WHEN is_featured = 1 THEN 1 ELSE 0 END) as featured,
        SUM(CASE WHEN price > 0 THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN price = 0 THEN 1 ELSE 0 END) as free
      FROM res_files
    `);
    
    if (folderStats.length > 0 && fileStats.length > 0) {
      const folderStat = folderStats[0];
      const fileStat = fileStats[0];
      
      console.log(`\n📈 Database Statistics:`);
      console.log(`\n   Folders:`);
      console.log(`     Total: ${folderStat.total}`);
      console.log(`     Active: ${folderStat.active}`);
      console.log(`     New: ${folderStat.new_folders}`);
      console.log(`\n   Files:`);
      console.log(`     Total: ${fileStat.total}`);
      console.log(`     Active: ${fileStat.active}`);
      console.log(`     New: ${fileStat.new_files}`);
      console.log(`     Featured: ${fileStat.featured}`);
      console.log(`     Paid: ${fileStat.paid}`);
      console.log(`     Free: ${fileStat.free}`);
    }
    
  } catch (error) {
    await connection.rollback();
    console.error('❌ Error seeding demo data:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Run the seed
seedDemoData()
  .catch((error) => {
    console.error('Failed to seed demo data:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (err) {
      console.error('Failed to close DB pool:', err);
    }
  });

