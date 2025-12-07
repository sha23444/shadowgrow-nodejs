var express = require('express');
var router = express.Router();
const telegramController = require("../../controllers/admin/telegram") 

router.get("/get-channel-id", async (req, res) => {
  try {
    const { bot_id } = req.query; // Optional: specific bot ID
    const botId = bot_id ? parseInt(bot_id) : null;
    const channelId = await telegramController.getChannelId(botId);
    res.json({ success: true, channelId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/send-test", async (req, res) => {
  try {
    const { chatId, message, bot_id } = req.body;
    
    if (!chatId || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'chatId and message are required' 
      });
    }

    const botId = bot_id ? parseInt(bot_id) : null;
    const result = await telegramController.sendMessage(chatId, message, botId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.response?.data 
    });
  }
});

module.exports = router;
