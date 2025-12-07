#!/usr/bin/env node

/**
 * Verifies that each user's cart contains at most one exclusive module type.
 * Exits with code 1 if any conflicting carts are found.
 */

const { pool } = require('../config/database');

async function checkCartIntegrity () {
  console.log('🔍 Checking cart integrity...');

  const [rows] = await pool.query(`
    SELECT 
      user_id,
      GROUP_CONCAT(DISTINCT item_type ORDER BY item_type) AS item_types,
      COUNT(DISTINCT item_type) AS typeCount,
      COUNT(*) AS itemCount
    FROM res_cart
    WHERE is_active = 1
    GROUP BY user_id
    HAVING typeCount > 1
  `);

  if (!rows.length) {
    console.log('✅ All carts contain a single module type.');
    return 0;
  }

  console.error('❌ Found carts with conflicting module types:');
  rows.forEach((row) => {
    console.error(` - user_id=${row.user_id} types=[${row.item_types}] total_items=${row.itemCount}`);
  });

  return 1;
}

(async () => {
  try {
    const code = await checkCartIntegrity();
    await pool.end();
    process.exit(code);
  } catch (error) {
    console.error('Failed to check cart integrity:', error);
    await pool.end();
    process.exit(2);
  }
})();

