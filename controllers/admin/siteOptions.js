const { pool } = require("../../config/database");
const { clearSettingsCache } = require("../../config/smart-cache");

// Helper function to sanitize values and remove problematic characters
function sanitizeValue(value) {
  if (typeof value !== 'string') return value;
  
  // Remove emojis and other problematic unicode characters
  // Keep only basic ASCII and safe unicode characters
  return value
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Remove emojis
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Remove symbols & pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Remove transport & map symbols
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Remove regional indicator symbols
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Remove miscellaneous symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Remove dingbats
    .trim();
}

// Helper function to convert string "1"/"0" to integers
function normalizeValue(value) {
  if (typeof value === 'string') {
    if (value === '1') return 1;
    if (value === '0') return 0;
  }
  return value;
}

/**
 * Site Options Controller
 * Handles CRUD operations for site configuration options with efficient is_public handling
 */

async function getAllOptions(req, res) {
  try {
    
    let query = `SELECT * FROM res_options`;
   
    const [optionsResult] = await pool.execute(query);

    const options = {};
    
    optionsResult.forEach(option => {
      options[option.option_name] = option.option_value;
    });

    return res.status(200).json({
      data: options
    });
  } catch (error) {
    console.error("Error fetching options:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}


// Add a new option (for internal use only)
async function addOption(req, res) {
    try {
      const { option_name, option_value, is_public } = req.body;
  
      // Validate that both option_name and option_value are provided
      if (!option_name) {
        return res.status(400).json({ error: "Option name and value are required" });
      }
  
      // Check if the option_name already exists
      const [existingOption] = await pool.execute(
        `SELECT option_id FROM res_options WHERE option_name = ?`,
        [option_name]
      );
  
      if (existingOption.length > 0) {
        return res.status(400).json({ error: "Option already exists" });
      }
  
      // Insert the new option with normalized and sanitized values
      await pool.execute(
        `INSERT INTO res_options (option_name, option_value, is_public) VALUES (?, ?, ?)`,
        [option_name, normalizeValue(sanitizeValue(option_value)), normalizeValue(is_public)]
      );
      
      // Clear settings cache after adding option
      await clearSettingsCache();
  
      return res.status(201).json({ message: "Option added successfully" });
    } catch (error) {
      console.error("Error adding option:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
  

/**
 * Update options with efficient is_public handling
 * 
 * Request body format examples:
 * 
 * 1. Simple value update (keeps existing is_public):
 * {
 *   "site_name": "New Site Name",
 *   "currency": "USD"
 * }
 * 
 * 2. Value + is_public update:
 * {
 *   "site_name": {
 *     "option_value": "New Site Name",
 *     "is_public": 1
 *   },
 *   "currency": {
 *     "option_value": "USD",
 *     "is_public": 0
 *   }
 * }
 * 
 * 3. Mixed format:
 * {
 *   "site_name": "New Site Name",  // Simple value, keeps existing is_public
 *   "currency": {
 *     "option_value": "USD",
 *     "is_public": 1
 *   }
 * }
 */
async function updateOption(req, res) {
  try {
    const optionsData = req.body;

    // Validate that optionsData is an object
    if (!optionsData || typeof optionsData !== 'object' || Array.isArray(optionsData)) {
      return res.status(400).json({ error: "Request body must be a JSON object" });
    }

    // Get all option names from the database to validate which ones exist
    const [existingOptions] = await pool.execute(
      `SELECT option_name, is_public FROM res_options`
    );
    
    const existingOptionMap = new Map(
      existingOptions.map(option => [option.option_name, option.is_public])
    );
    
    // Separate keys into existing and new
    const toUpdate = [];
    const toAdd = [];
    
    for (const [key, value] of Object.entries(optionsData)) {
      if (existingOptionMap.has(key)) {
        // For existing options, check if we need to update is_public
        const currentIsPublic = existingOptionMap.get(key);
        const newIsPublic = value.is_public !== undefined ? value.is_public : currentIsPublic;
        
        toUpdate.push({
          optionName: key,
          optionValue: normalizeValue(sanitizeValue(value.option_value || value)),
          isPublic: newIsPublic,
          needsIsPublicUpdate: value.is_public !== undefined
        });
      } else {
        // For new options, determine is_public value
        const isPublic = value.is_public !== undefined ? value.is_public : 0;
        toAdd.push({
          optionName: key,
          optionValue: normalizeValue(sanitizeValue(value.option_value || value)),
          isPublic: isPublic
        });
      }
    }

    // Update existing options
    const updatePromises = toUpdate.map(({ optionName, optionValue, isPublic, needsIsPublicUpdate }) => {
      if (needsIsPublicUpdate) {
        // Update both option_value and is_public
        return pool.execute(
          `UPDATE res_options SET option_value = ?, is_public = ? WHERE option_name = ?`,
          [optionValue, isPublic, optionName]
        );
      } else {
        // Update only option_value
        return pool.execute(
          `UPDATE res_options SET option_value = ? WHERE option_name = ?`,
          [optionValue, optionName]
        );
      }
    });

    // Add new options
    const addPromises = toAdd.map(({ optionName, optionValue, isPublic }) => {
      return pool.execute(
        `INSERT INTO res_options (option_name, option_value, is_public) VALUES (?, ?, ?)`,
        [optionName, optionValue, isPublic]
      );
    });

    // If nothing to update or add, return error
    if (toUpdate.length === 0 && toAdd.length === 0) {
      return res.status(400).json({ 
        error: "No options found to update or add"
      });
    }

    await Promise.all([...updatePromises, ...addPromises]);
    
    // Clear settings cache after updating options
    await clearSettingsCache();

    return res.status(200).json({ 
      message: "Options processed successfully",
      updatedOptions: toUpdate.length > 0 ? toUpdate.map(item => item.optionName) : undefined,
      addedOptions: toAdd.length > 0 ? toAdd.map(item => item.optionName) : undefined,
      summary: {
        totalUpdated: toUpdate.length,
        totalAdded: toAdd.length,
        optionsWithPublicStatusChanged: toUpdate.filter(item => item.needsIsPublicUpdate).length
      }
    });

  } catch (error) {
    console.error("Error updating/adding options:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

// Helper function to update options with is_public handling
async function updateOptionsWithPublicStatus(optionsData) {
  try {
    const [existingOptions] = await pool.execute(
      `SELECT option_name, is_public FROM res_options WHERE option_name IN (${Object.keys(optionsData).map(() => '?').join(',')})`,
      Object.keys(optionsData)
    );
    
    const existingOptionMap = new Map(
      existingOptions.map(option => [option.option_name, option.is_public])
    );
    
    const updatePromises = [];
    const insertPromises = [];
    
    for (const [optionName, optionData] of Object.entries(optionsData)) {
      const optionValue = normalizeValue(sanitizeValue(optionData.option_value || optionData));
      const isPublic = optionData.is_public !== undefined ? normalizeValue(optionData.is_public) : 0;
      
      if (existingOptionMap.has(optionName)) {
        // Update existing option
        updatePromises.push(
          pool.execute(
            `UPDATE res_options SET option_value = ?, is_public = ? WHERE option_name = ?`,
            [optionValue, isPublic, optionName]
          )
        );
      } else {
        // Insert new option
        insertPromises.push(
          pool.execute(
            `INSERT INTO res_options (option_name, option_value, is_public) VALUES (?, ?, ?)`,
            [optionName, optionValue, isPublic]
          )
        );
      }
    }
    
    await Promise.all([...updatePromises, ...insertPromises]);
    
    return {
      updated: updatePromises.length,
      inserted: insertPromises.length
    };
  } catch (error) {
    throw error;
  }
}

// Get options by public status
async function getOptionsByPublicStatus(isPublic = null) {
  try {
    let query = `SELECT option_name, option_value, is_public FROM res_options`;
    let params = [];
    
    if (isPublic !== null) {
      query += ` WHERE is_public = ?`;
      params.push(isPublic);
    }
    
    query += ` ORDER BY option_name`;
    
    const [rows] = await pool.execute(query, params);
    return rows;
  } catch (error) {
    throw error;
  }
}

module.exports = { 
  getAllOptions, 
  updateOption, 
  addOption, 
  updateOptionsWithPublicStatus,
  getOptionsByPublicStatus
};
