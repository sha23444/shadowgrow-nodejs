const slugify = require("slugify");

/**
 * Extract folder names from HTML content
 * @param {string} htmlContent - HTML content containing folder paths
 * @returns {Array} Array of folder names
 */
function extractFolderNamesFromHTML(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return [];
  }

  // First, replace common HTML entities
  let textContent = htmlContent
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&') // Replace &amp; with &
    .replace(/&lt;/g, '<') // Replace &lt; with <
    .replace(/&gt;/g, '>') // Replace &gt; with >
    .replace(/&quot;/g, '"') // Replace &quot; with "
    .replace(/&#39;/g, "'") // Replace &#39; with '
    .replace(/…/g, '...'); // Replace … with ...

  // Extract text from <p> tags and split by </p>
  const paragraphMatches = textContent.match(/<p[^>]*>(.*?)<\/p>/g);
  
  if (paragraphMatches) {
    // Extract content from each <p> tag
    const paragraphs = paragraphMatches.map(p => {
      return p.replace(/<p[^>]*>/, '').replace(/<\/p>/, '').trim();
    });
    
    // Join paragraphs with newlines
    textContent = paragraphs.join('\n');
  } else {
    // If no <p> tags, remove all HTML tags
    textContent = textContent.replace(/<[^>]*>/g, '');
  }

  // Split by newlines and filter out empty lines
  const lines = textContent
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && line !== '<br>');

  const folderNames = new Set();

  lines.forEach(line => {
    // Handle paths with forward slashes
    if (line.includes('/')) {
      const pathParts = line.split('/').map(part => part.trim()).filter(part => part.length > 0);
      
      // Add each part of the path as a potential folder
      pathParts.forEach(part => {
        if (part && part !== '...' && part !== '…' && part !== '<br>') {
          folderNames.add(part);
        }
      });
    } else {
      // Handle comma-separated folder names
      const commaSeparated = line.split(',').map(part => part.trim()).filter(part => part.length > 0);
      commaSeparated.forEach(part => {
        if (part && part !== '...' && part !== '…' && part !== '<br>') {
          folderNames.add(part);
        }
      });
    }
  });

  return Array.from(folderNames);
}

/**
 * Generate slug for a folder name
 * @param {string} folderName - The folder name to generate slug for
 * @returns {string} Generated slug
 */
function generateFolderSlug(folderName) {
  if (!folderName || typeof folderName !== 'string') {
    return '';
  }

  return slugify(folderName, {
    lower: true,
    replacement: '-',
    remove: /[*+~.()'"!:@]/g,
  });
}

/**
 * Generate unique slug for a folder name
 * @param {string} folderName - The folder name to generate unique slug for
 * @param {Array} existingSlugs - Array of existing slugs to check against
 * @returns {string} Unique slug
 */
function generateUniqueFolderSlug(folderName, existingSlugs = []) {
  const baseSlug = generateFolderSlug(folderName);
  
  if (!baseSlug) {
    return '';
  }

  let uniqueSlug = baseSlug;
  let counter = 1;

  while (existingSlugs.includes(uniqueSlug)) {
    uniqueSlug = `${baseSlug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
}

/**
 * Extract folder names and generate slugs from HTML content
 * @param {string} htmlContent - HTML content containing folder paths
 * @returns {Array} Array of objects with name and slug
 */
function extractFolderNamesAndSlugs(htmlContent) {
  const folderNames = extractFolderNamesFromHTML(htmlContent);
  
  return folderNames.map(name => ({
    name: name.trim(),
    slug: generateFolderSlug(name)
  }));
}

module.exports = {
  extractFolderNamesFromHTML,
  generateFolderSlug,
  generateUniqueFolderSlug,
  extractFolderNamesAndSlugs
}; 