-- Create telegram_bot_configurations table
-- This table stores multiple Telegram bot configurations for different modules/events

CREATE TABLE IF NOT EXISTS telegram_bot_configurations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  module VARCHAR(100) NOT NULL COMMENT 'Module name: new_user_signup, order_details, etc.',
  bot_token VARCHAR(255) NOT NULL COMMENT 'Telegram bot token',
  chat_id VARCHAR(50) NULL COMMENT 'Default chat ID for this bot (optional)',
  bot_name VARCHAR(100) NULL COMMENT 'Friendly name for the bot',
  description VARCHAR(255) NULL COMMENT 'Description of what this bot is used for',
  is_active BOOLEAN DEFAULT TRUE COMMENT 'Whether this configuration is active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_telegram_module (module),
  INDEX idx_telegram_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

