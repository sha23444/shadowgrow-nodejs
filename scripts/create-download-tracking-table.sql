-- Create table for tracking digital product downloads
CREATE TABLE IF NOT EXISTS res_product_downloads (
  download_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  download_count INT DEFAULT 0,
  download_limit INT NULL,
  expires_at DATETIME NULL,
  last_downloaded_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES res_orders(order_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES res_users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES res_products(product_id) ON DELETE CASCADE,
  INDEX idx_user_product (user_id, product_id),
  INDEX idx_order (order_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
