var express = require('express');
var router = express.Router();

const authenticateAdmin = require('../../middlewars/authenticateAdmin');
const telegramConfigController = require('../../controllers/admin/telegramConfig');

// All routes require admin authentication
router.get('/', authenticateAdmin, telegramConfigController.getAllConfigs);
router.get('/bots', authenticateAdmin, telegramConfigController.getAllBots); // Get all bots with their details
router.get('/modules', authenticateAdmin, telegramConfigController.getAllModules); // Get all modules (hierarchical)
router.get('/module/:module_id/bots', authenticateAdmin, telegramConfigController.getBotsByModuleId); // Get all bots subscribed to a module (accepts ID or module_key, must be before /module/:module)
router.get('/module/:module', authenticateAdmin, telegramConfigController.getConfigByModule); // Get config by module key
router.get('/:id', authenticateAdmin, telegramConfigController.getConfigById);
router.post('/', authenticateAdmin, telegramConfigController.createConfig);
router.post('/verify-token', authenticateAdmin, telegramConfigController.verifyToken); // Verify bot token before creating
router.post('/available-chats', authenticateAdmin, telegramConfigController.getAvailableChats);
router.put('/:id', authenticateAdmin, telegramConfigController.updateConfig);
router.put('/:id/modules', authenticateAdmin, telegramConfigController.updateBotModules); // Update bot's module subscriptions
router.delete('/:id', authenticateAdmin, telegramConfigController.deleteConfig);
router.post('/:id/test', authenticateAdmin, telegramConfigController.testConfig);

module.exports = router;

