const { pool } = require('../../config/database');

/**
 * Get all Telegram main/parent modules with aggregated bot statistics
 * Returns: main module name, active bots count, total bots count, status
 * Aggregates statistics from all child modules
 */
async function getAllConfigs(req, res) {
  try {
    // Get only parent/main modules (categories)
    const [parentModules] = await pool.execute(
      `SELECT 
        tm.id,
        tm.module_key,
        tm.module_name,
        tm.category,
        tm.description,
        tm.sort_order
       FROM telegram_modules tm
       WHERE tm.is_active = 1 
       AND tm.parent_module_id IS NULL
       ORDER BY tm.sort_order, tm.module_name`
    );

    // Get aggregated bot statistics for each main module (from all its children)
    const moduleStats = await Promise.all(
      parentModules.map(async (parentModule) => {
        // Get all child modules for this parent
        const [childModules] = await pool.execute(
          `SELECT id FROM telegram_modules 
           WHERE parent_module_id = ? AND is_active = 1`,
          [parentModule.id]
        );

        const childModuleIds = childModules.map(c => c.id);

        let totalBots = 0;
        let activeBots = 0;

        // Build list of module IDs to check (children if exists, or parent itself if standalone)
        const moduleIdsToCheck = childModuleIds.length > 0 
          ? childModuleIds  // Module has children - check children
          : [parentModule.id]; // Standalone module - check the module itself

        // Count total unique bots subscribed to this module or its children
        const [totalBotsResult] = await pool.execute(
          `SELECT COUNT(DISTINCT tbc.id) as total
           FROM telegram_bot_configurations tbc
           INNER JOIN telegram_bot_module_subscriptions tbms ON tbc.id = tbms.bot_config_id
           WHERE tbms.module_id IN (${moduleIdsToCheck.map(() => '?').join(',')})
           AND tbms.is_active = 1`,
          moduleIdsToCheck
        );

        // Count active bots subscribed to this module or its children
        const [activeBotsResult] = await pool.execute(
          `SELECT COUNT(DISTINCT tbc.id) as active
           FROM telegram_bot_configurations tbc
           INNER JOIN telegram_bot_module_subscriptions tbms ON tbc.id = tbms.bot_config_id
           WHERE tbms.module_id IN (${moduleIdsToCheck.map(() => '?').join(',')})
           AND tbms.is_active = 1 
           AND tbc.is_active = 1`,
          moduleIdsToCheck
        );

        totalBots = totalBotsResult[0]?.total || 0;
        activeBots = activeBotsResult[0]?.active || 0;

        const status = activeBots > 0 ? 'active' : 'inactive';

        return {
          module_id: parentModule.id,
          module_key: parentModule.module_key,
          module_name: parentModule.module_name,
          category: parentModule.category,
          description: parentModule.description,
          active_bots_count: activeBots, // Number of active Telegram bot accounts subscribed
          total_bots: totalBots, // Total number of bot accounts (active + inactive) subscribed
          status: status,
          sort_order: parentModule.sort_order
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: moduleStats,
      count: moduleStats.length
    });
  } catch (error) {
    console.error('Error fetching Telegram configs:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * Get a single Telegram bot configuration by ID with subscribed modules
 */
async function getConfigById(req, res) {
  try {
    const { id } = req.params;

    const [configs] = await pool.execute(
      `SELECT 
        tbc.id, tbc.module, tbc.bot_token, tbc.chat_id, tbc.bot_name, 
        tbc.name, tbc.mobile, tbc.description, tbc.is_active, tbc.created_at, tbc.updated_at
       FROM telegram_bot_configurations tbc
       WHERE tbc.id = ?`,
      [id]
    );

    if (configs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    // Get subscribed modules
    const [modules] = await pool.execute(
      `SELECT 
        tm.id, tm.module_key, tm.module_name, tm.category, 
        tm.parent_module_id, tm.description, tbms.is_active as subscription_active
       FROM telegram_bot_module_subscriptions tbms
       INNER JOIN telegram_modules tm ON tbms.module_id = tm.id
       WHERE tbms.bot_config_id = ? AND tbms.is_active = 1
       ORDER BY tm.category, tm.sort_order`,
      [id]
    );

    const config = configs[0];
    // Don't mask token for admin viewing in detail view
    return res.status(200).json({
      success: true,
      data: {
        ...config,
        subscribed_modules: modules
      }
    });
  } catch (error) {
    console.error('Error fetching Telegram config:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Get configuration by module name
 */
async function getConfigByModule(req, res) {
  try {
    const { module } = req.params;

    const [configs] = await pool.execute(
      `SELECT id, module, bot_token, chat_id, bot_name, description, is_active, created_at, updated_at 
       FROM telegram_bot_configurations 
       WHERE module = ? AND is_active = 1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [module]
    );

    if (configs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active configuration found for this module'
      });
    }

    return res.status(200).json({
      success: true,
      data: configs[0]
    });
  } catch (error) {
    console.error('Error fetching Telegram config by module:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Create a new Telegram bot configuration with multiple module subscriptions
 * Supports both old format (single module) and new format (modules array)
 */
async function createConfig(req, res) {
  const connection = await pool.getConnection();
  try {
    const { module, modules, bot_token, chat_id, chat_name, bot_name, name, mobile, description, is_active } = req.body;

    // Validation
    if (!bot_token) {
      connection.release();
      return res.status(400).json({
        success: false,
        error: 'bot_token is required'
      });
    }

    // Support both old format (module) and new format (modules array)
    let moduleIds = [];
    let legacyModule = module || 'general'; // Keep for backward compatibility

    if (modules && Array.isArray(modules) && modules.length > 0) {
      // New format: multiple modules
      // modules can be module_ids or module_keys
      const modulePlaceholders = modules.map(() => '?').join(',');
      const [foundModules] = await connection.execute(
        `SELECT id, module_key FROM telegram_modules 
         WHERE (id IN (${modulePlaceholders}) OR module_key IN (${modulePlaceholders}))
         AND is_active = 1`,
        [...modules, ...modules]
      );

      if (foundModules.length === 0) {
        connection.release();
        return res.status(400).json({
          success: false,
          error: 'No valid modules found. Provide valid module IDs or module keys.'
        });
      }

      moduleIds = foundModules.map(m => m.id);
      legacyModule = foundModules[0].module_key; // Use first module for backward compatibility
    } else if (module) {
      // Old format: single module (backward compatibility)
      const [foundModule] = await connection.execute(
        `SELECT id FROM telegram_modules WHERE module_key = ? AND is_active = 1`,
        [module]
      );

      if (foundModule.length === 0) {
        connection.release();
        return res.status(400).json({
          success: false,
          error: `Module '${module}' not found. Use 'modules' array with valid module IDs or keys.`
        });
      }

      moduleIds = [foundModule[0].id];
    } else {
      connection.release();
      return res.status(400).json({
        success: false,
        error: 'Either module (single) or modules (array) is required'
      });
    }

    await connection.beginTransaction();

    // Insert new bot configuration
    const [result] = await connection.execute(
      `INSERT INTO telegram_bot_configurations 
       (module, bot_token, chat_id, bot_name, name, mobile, description, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        legacyModule,
        bot_token,
        chat_id || null,
        bot_name || null,
        name || null,
        mobile || null,
        description || null,
        is_active !== false ? 1 : 0
      ]
    );

    const botConfigId = result.insertId;

    // Create module subscriptions
    for (const moduleId of moduleIds) {
      await connection.execute(
        `INSERT INTO telegram_bot_module_subscriptions (bot_config_id, module_id, is_active)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE is_active = 1`,
        [botConfigId, moduleId, 1]
      );
    }

    await connection.commit();

    // Fetch the created config with modules
    const [configs] = await connection.execute(
      `SELECT id, module, bot_token, chat_id, bot_name, name, mobile, description, is_active, created_at, updated_at 
       FROM telegram_bot_configurations 
       WHERE id = ?`,
      [botConfigId]
    );

    const [subscribedModules] = await connection.execute(
      `SELECT tm.id, tm.module_key, tm.module_name, tm.category 
       FROM telegram_bot_module_subscriptions tbms
       INNER JOIN telegram_modules tm ON tbms.module_id = tm.id
       WHERE tbms.bot_config_id = ? AND tbms.is_active = 1`,
      [botConfigId]
    );

    connection.release();

    return res.status(201).json({
      success: true,
      message: 'Telegram bot configuration created successfully',
      data: {
        ...configs[0],
        subscribed_modules: subscribedModules,
        modules_count: subscribedModules.length
      }
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    
    console.error('Error creating Telegram config:', error);
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * Update a Telegram bot configuration
 */
async function updateConfig(req, res) {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { module, modules, bot_token, chat_id, chat_name, bot_name, name, mobile, description, is_active } = req.body;

    // Check if config exists
    const [existing] = await connection.execute(
      `SELECT * FROM telegram_bot_configurations WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    await connection.beginTransaction();

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (module !== undefined) {
      if (!/^[a-z0-9_]+$/.test(module)) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({
          success: false,
          error: 'module must contain only lowercase letters, numbers, and underscores'
        });
      }
      updates.push('module = ?');
      values.push(module);
    }
    if (bot_token !== undefined) {
      updates.push('bot_token = ?');
      values.push(bot_token);
    }
    if (chat_id !== undefined) {
      updates.push('chat_id = ?');
      values.push(chat_id);
    }
    // Note: chat_name may not exist in database schema
    // If provided, attempt to update (will error gracefully if column doesn't exist)
    if (chat_name !== undefined) {
      updates.push('chat_name = ?');
      values.push(chat_name);
    }
    if (bot_name !== undefined) {
      updates.push('bot_name = ?');
      values.push(bot_name);
    }
    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (mobile !== undefined) {
      updates.push('mobile = ?');
      values.push(mobile);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    // Update bot configuration fields if any
    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      values.push(id);

      await connection.execute(
        `UPDATE telegram_bot_configurations 
         SET ${updates.join(', ')} 
         WHERE id = ?`,
        values
      );
    }

    // Handle module subscriptions if modules array is provided
    if (Array.isArray(modules)) {
      if (modules.length === 0) {
        // If empty array, deactivate all subscriptions
        await connection.execute(
          `UPDATE telegram_bot_module_subscriptions 
           SET is_active = 0 
           WHERE bot_config_id = ?`,
          [id]
        );
      } else {
        // Find modules (by ID or key)
        const modulePlaceholders = modules.map(() => '?').join(',');
        const [foundModules] = await connection.execute(
          `SELECT id FROM telegram_modules 
           WHERE (id IN (${modulePlaceholders}) OR module_key IN (${modulePlaceholders}))
           AND is_active = 1`,
          [...modules, ...modules]
        );

        if (foundModules.length === 0) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            success: false,
            error: 'No valid modules found. Please check the module keys/IDs.'
          });
        }

        const moduleIds = foundModules.map(m => m.id);

        // Deactivate all current subscriptions
        await connection.execute(
          `UPDATE telegram_bot_module_subscriptions 
           SET is_active = 0 
           WHERE bot_config_id = ?`,
          [id]
        );

        // Create new subscriptions
        for (const moduleId of moduleIds) {
          await connection.execute(
            `INSERT INTO telegram_bot_module_subscriptions (bot_config_id, module_id, is_active)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE is_active = 1`,
            [id, moduleId, 1]
          );
        }
      }
    }

    await connection.commit();

    // Fetch updated config with subscribed modules
    const [configs] = await connection.execute(
      `SELECT id, module, bot_token, chat_id, bot_name, name, mobile, description, is_active, created_at, updated_at 
       FROM telegram_bot_configurations 
       WHERE id = ?`,
      [id]
    );

    // Get subscribed modules
    const [subscribedModules] = await connection.execute(
      `SELECT tm.id, tm.module_key, tm.module_name, tm.category 
       FROM telegram_bot_module_subscriptions tbms
       INNER JOIN telegram_modules tm ON tbms.module_id = tm.id
       WHERE tbms.bot_config_id = ? AND tbms.is_active = 1
       ORDER BY tm.category, tm.sort_order`,
      [id]
    );

    connection.release();

    return res.status(200).json({
      success: true,
      message: 'Telegram bot configuration updated successfully',
      data: {
        ...configs[0],
        subscribed_modules: subscribedModules,
        modules_count: subscribedModules.length
      }
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    
    console.error('Error updating Telegram config:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * Delete a Telegram bot configuration
 */
async function deleteConfig(req, res) {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;

    // Check if config exists
    const [existing] = await connection.execute(
      `SELECT * FROM telegram_bot_configurations WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    await connection.beginTransaction();
    await connection.execute(
      `DELETE FROM telegram_bot_configurations WHERE id = ?`,
      [id]
    );
    await connection.commit();
    connection.release();

    return res.status(200).json({
      success: true,
      message: 'Telegram bot configuration deleted successfully'
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    
    console.error('Error deleting Telegram config:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Verify a bot token is valid
 * Checks if the token is valid by calling Telegram API getMe
 */
async function verifyToken(req, res) {
  try {
    const { bot_token } = req.body;

    if (!bot_token) {
      return res.status(400).json({
        success: false,
        error: 'bot_token is required'
      });
    }

    const axios = require('axios');
    const API_URL = `https://api.telegram.org/bot${bot_token}`;

    try {
      const botInfo = await axios.get(`${API_URL}/getMe`);
      
      if (botInfo.data.ok && botInfo.data.result) {
        const bot = botInfo.data.result;
        
        return res.status(200).json({
          success: true,
          message: 'Bot token is valid',
          data: {
            bot_id: bot.id,
            bot_name: bot.first_name,
            bot_username: bot.username ? `@${bot.username}` : null,
            can_join_groups: bot.can_join_groups || false,
            can_read_all_group_messages: bot.can_read_all_group_messages || false,
            supports_inline_queries: bot.supports_inline_queries || false,
            is_bot: bot.is_bot
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid bot token - Telegram API returned error',
          details: botInfo.data
        });
      }
    } catch (error) {
      if (error.response) {
        const errorCode = error.response.status;
        const errorData = error.response.data;
        
        if (errorCode === 401) {
          return res.status(400).json({
            success: false,
            error: 'Invalid bot token - Unauthorized',
            details: errorData.description || 'Token is invalid or revoked'
          });
        }
        
        return res.status(400).json({
          success: false,
          error: 'Failed to verify bot token',
          details: errorData.description || error.message
        });
      }
      
      return res.status(500).json({
        success: false,
        error: 'Failed to verify bot token',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Error verifying bot token:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Get available chats for a bot token
 * This allows admins to fetch and select chat IDs instead of entering manually
 */
async function getAvailableChats(req, res) {
  try {
    const { bot_token } = req.body;

    if (!bot_token) {
      return res.status(400).json({
        success: false,
        error: 'bot_token is required'
      });
    }

    const axios = require('axios');
    const API_URL = `https://api.telegram.org/bot${bot_token}`;

    // First verify the bot token is valid
    try {
      const botInfo = await axios.get(`${API_URL}/getMe`);
      if (!botInfo.data.ok) {
        return res.status(400).json({
          success: false,
          error: 'Invalid bot token'
        });
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bot token or bot not found',
        details: error.response?.data?.description || error.message
      });
    }

    // Get available chats from bot updates
    try {
      const updatesResponse = await axios.get(`${API_URL}/getUpdates`, {
        params: { offset: -100, limit: 100 } // Get last 100 updates
      });

      const updates = updatesResponse.data.result || [];
      const chats = [];
      const seenChats = new Set();

      for (const update of updates) {
        if (update.message && update.message.chat) {
          const chat = update.message.chat;
          const chatId = String(chat.id);
          
          if (!seenChats.has(chatId)) {
            seenChats.add(chatId);
            chats.push({
              id: chatId,
              type: chat.type, // 'private', 'group', 'supergroup', 'channel'
              title: chat.title || chat.first_name || chat.username || 'Unknown',
              first_name: chat.first_name || null,
              last_name: chat.last_name || null,
              username: chat.username || null
            });
          }
        }
      }

      // Sort chats: channels first, then groups, then private
      chats.sort((a, b) => {
        const order = { 'channel': 0, 'supergroup': 1, 'group': 2, 'private': 3 };
        return (order[a.type] || 99) - (order[b.type] || 99);
      });

      if (chats.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          message: 'No chats found. Users must send /start to the bot first.',
          warning: 'No chats available. Make sure users have sent messages to the bot.'
        });
      }

      return res.status(200).json({
        success: true,
        data: chats,
        count: chats.length,
        message: `Found ${chats.length} chat(s)`
      });
    } catch (error) {
      console.error('Error fetching chats:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch chats',
        details: error.response?.data || error.message
      });
    }
  } catch (error) {
    console.error('Error in getAvailableChats:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Test a bot configuration by sending a test message
 */
async function testConfig(req, res) {
  try {
    const { id } = req.params;
    const { chat_id, test_message } = req.body;

    // Get configuration
    const [configs] = await pool.execute(
      `SELECT * FROM telegram_bot_configurations WHERE id = ?`,
      [id]
    );

    if (configs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found'
      });
    }

    const config = configs[0];

    if (!config.is_active) {
      return res.status(400).json({
        success: false,
        error: 'Configuration is not active'
      });
    }

    // Use provided chat_id or fallback to config's chat_id
    const targetChatId = chat_id || config.chat_id;

    if (!targetChatId) {
      return res.status(400).json({
        success: false,
        error: 'chat_id is required. Provide it in the request or set it in the configuration'
      });
    }

    // Send test message
    const axios = require('axios');
    const API_URL = `https://api.telegram.org/bot${config.bot_token}`;
    
    const message = test_message || `🧪 Test message from ${config.bot_name || config.module} bot\nTime: ${new Date().toLocaleString()}`;

    const response = await axios.post(`${API_URL}/sendMessage`, {
      chat_id: targetChatId,
      text: message
    });

    if (response.data.ok) {
      return res.status(200).json({
        success: true,
        message: 'Test message sent successfully',
        data: {
          message_id: response.data.result.message_id,
          chat: response.data.result.chat
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Failed to send test message',
        details: response.data
      });
    }
  } catch (error) {
    console.error('Error testing Telegram config:', error);
    
    if (error.response) {
      return res.status(400).json({
        success: false,
        error: error.response.data?.description || 'Failed to send test message',
        details: error.response.data
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Get all available modules with hierarchical structure
 */
async function getAllModules(req, res) {
  try {
    const [modules] = await pool.execute(
      `SELECT 
        id, module_key, module_name, category, parent_module_id, 
        description, sort_order, is_active
       FROM telegram_modules
       WHERE is_active = 1
       ORDER BY category, sort_order, module_name`
    );

    // First, identify all parent modules (categories) and create entries for them
    const grouped = {};
    const categories = [];
    const parentCategories = {};

    // Step 1: Create entries for ALL parent modules (even if they have no children)
    modules.forEach(module => {
      if (!module.parent_module_id) {
        // This is a parent category
        if (!parentCategories[module.category]) {
          parentCategories[module.category] = module;
          
          // Create category entry immediately
          grouped[module.category] = {
            id: module.id,
            module_key: module.module_key,
            module_name: module.module_name,
            category: module.category,
            description: module.description,
            children: []
          };
          categories.push(module.category);
        }
      }
    });

    // Step 2: Add children to their parent categories
    modules.forEach(module => {
      if (module.parent_module_id) {
        // This is a child module (event)
        const categoryName = module.category;
        
        // Ensure category entry exists (should already exist from step 1)
        if (!grouped[categoryName]) {
          // Fallback: create placeholder if parent wasn't found (shouldn't happen normally)
          grouped[categoryName] = {
            id: null,
            module_key: categoryName.toLowerCase(),
            module_name: categoryName,
            category: categoryName,
            description: `${categoryName} notifications`,
            children: []
          };
          categories.push(categoryName);
        }
        
        grouped[categoryName].children.push({
          id: module.id,
          module_key: module.module_key,
          module_name: module.module_name,
          category: module.category,
          parent_module_id: module.parent_module_id,
          description: module.description,
          sort_order: module.sort_order
        });
      }
    });

    // Format response - sort by category sort_order or name
    const result = categories
      .map(cat => grouped[cat])
      .sort((a, b) => {
        // Get sort_order from parent module if available
        const aParent = modules.find(m => m.id === a.id);
        const bParent = modules.find(m => m.id === b.id);
        const aOrder = aParent?.sort_order || 999;
        const bOrder = bParent?.sort_order || 999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.module_name.localeCompare(b.module_name);
      });

    // Create a map of category to module IDs for efficient lookup
    const categoryModuleMap = new Map();
    result.forEach(category => {
      const moduleIds = [category.id, ...category.children.map(c => c.id)].filter(id => id !== null);
      categoryModuleMap.set(category.category, moduleIds);
    });

    // Get all unique module IDs across all categories
    const allModuleIds = Array.from(new Set(
      Array.from(categoryModuleMap.values()).flat()
    ));

    let categoryStats = [];

    if (allModuleIds.length > 0) {
      // Optimized: Get bot statistics for all categories in 2 queries instead of 2*N queries
      const [activeBotsByCategory] = await pool.execute(
        `SELECT 
           tm.category,
           COUNT(DISTINCT tbc.id) as active_bots
         FROM telegram_bot_configurations tbc
         INNER JOIN telegram_bot_module_subscriptions tbms ON tbc.id = tbms.bot_config_id
         INNER JOIN telegram_modules tm ON tbms.module_id = tm.id
         WHERE tbms.module_id IN (${allModuleIds.map(() => '?').join(',')})
         AND tbc.is_active = 1
         AND tbms.is_active = 1
         GROUP BY tm.category`,
        allModuleIds
      );

      const [totalBotsByCategory] = await pool.execute(
        `SELECT 
           tm.category,
           COUNT(DISTINCT tbc.id) as total_bots
         FROM telegram_bot_configurations tbc
         INNER JOIN telegram_bot_module_subscriptions tbms ON tbc.id = tbms.bot_config_id
         INNER JOIN telegram_modules tm ON tbms.module_id = tm.id
         WHERE tbms.module_id IN (${allModuleIds.map(() => '?').join(',')})
         AND tbms.is_active = 1
         GROUP BY tm.category`,
        allModuleIds
      );

      // Create maps for quick lookup
      const activeBotsMap = new Map(activeBotsByCategory.map(s => [s.category, Number(s.active_bots)]));
      const totalBotsMap = new Map(totalBotsByCategory.map(s => [s.category, Number(s.total_bots)]));

      // Build stats array
      categoryStats = result.map(category => {
        const activeBots = activeBotsMap.get(category.category) || 0;
        const totalBots = totalBotsMap.get(category.category) || 0;
        const status = activeBots > 0 ? 'active' : 'inactive';
        
        return {
          category: category.category,
          active_bots: activeBots,
          total_bots: totalBots,
          status: status
        };
      });
    } else {
      // No modules, set all to zero
      categoryStats = result.map(category => ({
        category: category.category,
        active_bots: 0,
        total_bots: 0,
        status: 'inactive'
      }));
    }

    // Add bot statistics to each category
    const statsMap = new Map(categoryStats.map(s => [s.category, s]));
    const resultWithStats = result.map(category => ({
      ...category,
      active_bots: statsMap.get(category.category)?.active_bots || 0,
      total_bots: statsMap.get(category.category)?.total_bots || 0,
      status: statsMap.get(category.category)?.status || 'inactive'
    }));

    // Calculate overall statistics
    const overallStats = {
      total_categories: resultWithStats.length,
      total_active_bots: categoryStats.reduce((sum, s) => sum + s.active_bots, 0),
      total_bots: categoryStats.reduce((sum, s) => sum + s.total_bots, 0)
    };

    return res.status(200).json({
      success: true,
      data: resultWithStats,
      count: resultWithStats.length,
      statistics: overallStats
    });
  } catch (error) {
    console.error('Error fetching modules:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Update a bot's module subscriptions
 */
async function updateBotModules(req, res) {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { modules } = req.body; // Array of module IDs or module keys

    if (!Array.isArray(modules) || modules.length === 0) {
      connection.release();
      return res.status(400).json({
        success: false,
        error: 'modules must be a non-empty array of module IDs or module keys'
      });
    }

    // Check if bot config exists
    const [existing] = await connection.execute(
      `SELECT id FROM telegram_bot_configurations WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      connection.release();
      return res.status(404).json({
        success: false,
        error: 'Bot configuration not found'
      });
    }

    await connection.beginTransaction();

    // Find modules (by ID or key)
    const modulePlaceholders = modules.map(() => '?').join(',');
    const [foundModules] = await connection.execute(
      `SELECT id FROM telegram_modules 
       WHERE (id IN (${modulePlaceholders}) OR module_key IN (${modulePlaceholders}))
       AND is_active = 1`,
      [...modules, ...modules]
    );

    if (foundModules.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        error: 'No valid modules found'
      });
    }

    const moduleIds = foundModules.map(m => m.id);

    // Deactivate all current subscriptions
    await connection.execute(
      `UPDATE telegram_bot_module_subscriptions 
       SET is_active = 0 
       WHERE bot_config_id = ?`,
      [id]
    );

    // Create new subscriptions
    for (const moduleId of moduleIds) {
      await connection.execute(
        `INSERT INTO telegram_bot_module_subscriptions (bot_config_id, module_id, is_active)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE is_active = 1`,
        [id, moduleId, 1]
      );
    }

    await connection.commit();

    // Fetch updated subscriptions
    const [subscribedModules] = await connection.execute(
      `SELECT tm.id, tm.module_key, tm.module_name, tm.category 
       FROM telegram_bot_module_subscriptions tbms
       INNER JOIN telegram_modules tm ON tbms.module_id = tm.id
       WHERE tbms.bot_config_id = ? AND tbms.is_active = 1
       ORDER BY tm.category, tm.sort_order`,
      [id]
    );

    connection.release();

    return res.status(200).json({
      success: true,
      message: 'Bot module subscriptions updated successfully',
      data: {
        bot_config_id: id,
        subscribed_modules: subscribedModules,
        count: subscribedModules.length
      }
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    
    console.error('Error updating bot modules:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * Get all bots subscribed to a specific module
 * Returns complete bot details for all bots subscribed to the module (or its children)
 */
async function getBotsByModuleId(req, res) {
  try {
    const { module_id } = req.params;

    // Check if module_id is numeric or a module key (string)
    const isNumeric = /^\d+$/.test(module_id);
    
    let query;
    let params;
    
    if (isNumeric) {
      // Search by ID
      query = `SELECT id, module_key, module_name, category, parent_module_id
               FROM telegram_modules
               WHERE id = ? AND is_active = 1`;
      params = [module_id];
    } else {
      // Search by module_key
      query = `SELECT id, module_key, module_name, category, parent_module_id
               FROM telegram_modules
               WHERE module_key = ? AND is_active = 1`;
      params = [module_id];
    }

    // Verify module exists
    const [modules] = await pool.execute(query, params);

    if (modules.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Module not found or inactive'
      });
    }

    const module = modules[0];

    // Get child modules if this is a parent module
    let moduleIdsToCheck = [module.id]; // Use module.id, not module_id (which might be a string)
    
    if (!module.parent_module_id) {
      // This is a parent module - get all its children
      const [childModules] = await pool.execute(
        `SELECT id FROM telegram_modules 
         WHERE parent_module_id = ? AND is_active = 1`,
        [module.id]
      );
      
      if (childModules.length > 0) {
        moduleIdsToCheck = childModules.map(c => c.id);
      }
    }

    // Get all bots subscribed to this module (or its children)
    const [bots] = await pool.execute(
      `SELECT DISTINCT
        tbc.id,
        tbc.module,
        tbc.bot_token,
        tbc.chat_id,
        tbc.bot_name,
        tbc.name,
        tbc.mobile,
        tbc.description,
        tbc.is_active,
        tbc.created_at,
        tbc.updated_at,
        GROUP_CONCAT(
          DISTINCT CONCAT(tm.module_key, ':', tm.module_name)
          ORDER BY tm.module_name
          SEPARATOR ', '
        ) as subscribed_modules_list
       FROM telegram_bot_configurations tbc
       INNER JOIN telegram_bot_module_subscriptions tbms ON tbc.id = tbms.bot_config_id
       INNER JOIN telegram_modules tm ON tbms.module_id = tm.id
       WHERE tbms.module_id IN (${moduleIdsToCheck.map(() => '?').join(',')})
       AND tbms.is_active = 1
       GROUP BY tbc.id
       ORDER BY tbc.is_active DESC, tbc.created_at DESC`,
      moduleIdsToCheck
    );

    // Get detailed subscribed modules for each bot
    const botsWithDetails = await Promise.all(
      bots.map(async (bot) => {
        const [subscribedModules] = await pool.execute(
          `SELECT 
            tm.id as module_id,
            tm.module_key,
            tm.module_name,
            tm.category,
            tbms.is_active as subscription_active
           FROM telegram_bot_module_subscriptions tbms
           INNER JOIN telegram_modules tm ON tbms.module_id = tm.id
           WHERE tbms.bot_config_id = ?
           AND tbms.module_id IN (${moduleIdsToCheck.map(() => '?').join(',')})
           AND tbms.is_active = 1
           ORDER BY tm.category, tm.module_name`,
          [bot.id, ...moduleIdsToCheck]
        );

        return {
          id: bot.id,
          bot_token: bot.bot_token, // Full token for admin viewing
          chat_id: bot.chat_id,
          bot_name: bot.bot_name,
          name: bot.name,
          mobile: bot.mobile,
          description: bot.description,
          is_active: bot.is_active,
          subscribed_modules: subscribedModules,
          subscribed_modules_list: bot.subscribed_modules_list, // For quick reference
          created_at: bot.created_at,
          updated_at: bot.updated_at
        };
      })
    );

    const response = {
      success: true,
      module: {
        id: module.id,
        module_key: module.module_key,
        module_name: module.module_name,
        category: module.category
      },
      data: botsWithDetails,
      count: botsWithDetails.length,
      active_count: botsWithDetails.filter(b => b.is_active).length,
      inactive_count: botsWithDetails.filter(b => !b.is_active).length
    };

    // Add helpful message if no bots found
    if (botsWithDetails.length === 0) {
      response.message = 'No bots subscribed to this module yet';
      response.info = `No bot configurations found for ${module.module_name}. Create a bot and subscribe it to this module to receive notifications.`;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching bots by module:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}

/**
 * Get list of all bots with their details
 * Returns: bot token, bot name, total subscribed modules, and other bot details
 * Supports search and pagination
 * Query params: search, page, limit
 */
async function getAllBots(req, res) {
  try {
    // Get query parameters
    const search = req.query.search || '';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    // Validate pagination parameters
    if (page < 1) {
      return res.status(400).json({
        success: false,
        error: 'Page must be greater than 0'
      });
    }
    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 100'
      });
    }

    // Build search conditions
    let searchCondition = '';
    let searchParams = [];
    if (search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      searchCondition = `AND (
        tbc.bot_name LIKE ? OR 
        tbc.bot_token LIKE ? OR 
        tbc.description LIKE ? OR
        tbc.chat_id LIKE ?
      )`;
      searchParams = [searchTerm, searchTerm, searchTerm, searchTerm];
    }

    // Get total count for pagination (without grouping for accurate count)
    let totalBots = 0;
    let totalPages = 0;
    
    try {
      const [countResult] = await pool.execute(
        `SELECT COUNT(DISTINCT tbc.id) as total
         FROM telegram_bot_configurations tbc
         WHERE 1=1 ${searchCondition}`,
        searchParams
      );
      totalBots = countResult[0]?.total || 0;
      totalPages = Math.ceil(totalBots / limit);
    } catch (countError) {
      console.error('Error counting bots:', countError);
      return res.status(500).json({
        success: false,
        error: 'Error counting bots',
        details: countError.message
      });
    }

    // Get paginated bots with their subscribed module counts
    // Note: chat_name, name, mobile may not exist in all database schemas
    const [bots] = await pool.execute(
      `SELECT 
        tbc.id,
        tbc.bot_token,
        tbc.bot_name,
        tbc.chat_id,
        tbc.description,
        tbc.is_active,
        tbc.created_at,
        tbc.updated_at,
        COUNT(DISTINCT tbms.module_id) as subscribed_modules_count
       FROM telegram_bot_configurations tbc
       LEFT JOIN telegram_bot_module_subscriptions tbms 
         ON tbc.id = tbms.bot_config_id 
         AND tbms.is_active = 1
       WHERE 1=1 ${searchCondition}
       GROUP BY tbc.id
       ORDER BY tbc.created_at DESC
       LIMIT ? OFFSET ?`,
      [...searchParams, limit, offset]
    );

    // Optimized: Get all subscribed modules in a single query instead of N queries
    const botIds = bots.map(b => b.id);
    let modulesByBotId = {};

    if (botIds.length > 0) {
      const [allSubscribedModules] = await pool.execute(
        `SELECT 
          tbms.bot_config_id,
          tm.id,
          tm.module_key,
          tm.module_name,
          tm.category,
          tbms.is_active as subscription_active
         FROM telegram_bot_module_subscriptions tbms
         INNER JOIN telegram_modules tm ON tbms.module_id = tm.id
         WHERE tbms.bot_config_id IN (${botIds.map(() => '?').join(',')})
         AND tbms.is_active = 1
         ORDER BY tbms.bot_config_id, tm.category, tm.sort_order`,
        botIds
      );

      // Group modules by bot_config_id and then by category
      allSubscribedModules.forEach(module => {
        if (!modulesByBotId[module.bot_config_id]) {
          modulesByBotId[module.bot_config_id] = {};
        }
        
        const category = module.category || 'Other';
        if (!modulesByBotId[module.bot_config_id][category]) {
          modulesByBotId[module.bot_config_id][category] = [];
        }
        
        modulesByBotId[module.bot_config_id][category].push({
          id: module.id,
          module_key: module.module_key,
          module_name: module.module_name,
          category: module.category,
          subscription_active: Boolean(module.subscription_active)
        });
      });
    }

    // Build response with subscribed modules grouped by category
    const botsWithModules = bots.map(bot => {
      const modulesByCategory = modulesByBotId[bot.id] || {};
      
      // Convert to array format with category as key
      const subscribedModulesGrouped = Object.keys(modulesByCategory).map(category => ({
        category: category,
        modules: modulesByCategory[category]
      })).sort((a, b) => a.category.localeCompare(b.category));

      return {
        id: bot.id,
        bot_token: bot.bot_token,
        bot_name: bot.bot_name,
        chat_id: bot.chat_id,
        description: bot.description,
        is_active: Boolean(bot.is_active),
        subscribed_modules_count: Number(bot.subscribed_modules_count),
        subscribed_modules: subscribedModulesGrouped,
        created_at: bot.created_at,
        updated_at: bot.updated_at
      };
    });

    // Calculate statistics for current page
    const activeBots = botsWithModules.filter(b => b.is_active).length;
    const inactiveBots = botsWithModules.filter(b => !b.is_active).length;
    const totalSubscribedModules = botsWithModules.reduce((sum, b) => sum + b.subscribed_modules_count, 0);

    return res.status(200).json({
      success: true,
      data: botsWithModules,
      pagination: {
        current_page: page,
        per_page: limit,
        total: totalBots,
        total_pages: totalPages,
        has_next_page: page < totalPages,
        has_previous_page: page > 1
      },
      count: botsWithModules.length,
      statistics: {
        total_bots: totalBots,
        active_bots_on_page: activeBots,
        inactive_bots_on_page: inactiveBots,
        total_subscribed_modules_on_page: totalSubscribedModules,
        search_query: search || null
      }
    });
  } catch (error) {
    console.error('Error fetching all bots:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

module.exports = {
  getAllConfigs,
  getConfigById,
  getConfigByModule,
  createConfig,
  updateConfig,
  deleteConfig,
  testConfig,
  getAvailableChats,
  getAllModules,
  updateBotModules,
  getBotsByModuleId,
  getAllBots,
  verifyToken
};

