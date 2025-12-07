const { pool } = require('../config/database');

// Realistic download packages data (max 8)
const downloadPackages = [
  {
    title: "Free Starter Package",
    description: "Perfect for beginners! Get started with basic mobile firmware tools and utilities. Limited downloads but completely free.",
    price: 0.00,
    actual_price: null,
    marketing_text: "Start your journey today - 100% FREE!",
    badge: "FREE",
    period: 30,
    devices: 1,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 0,
    bandwidth: 0,
    bandwidth_files: 0,
    bandwidth_feature: 0,
    is_fair: 0,
    fair: 0,
    fair_files: 0,
    order: 1
  },
  {
    title: "Basic Flasher Plan",
    description: "Essential mobile firmware flashing tools with moderate downloads. Great for occasional users who need reliable flashing solutions.",
    price: 9.99,
    actual_price: 14.99,
    marketing_text: "Save 33% - Limited Time Offer!",
    badge: "POPULAR",
    period: 30,
    devices: 3,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 5000, // MB
    bandwidth_files: 50,
    bandwidth_feature: 1,
    is_fair: 0,
    fair: 0,
    fair_files: 0,
    order: 2
  },
  {
    title: "Professional Firmware Suite",
    description: "Complete mobile firmware solution with advanced tools, unlimited downloads, and priority support. Perfect for mobile technicians and repair shops.",
    price: 29.99,
    actual_price: 39.99,
    marketing_text: "Best Value - 25% OFF! Most Popular Choice",
    badge: "BEST VALUE",
    period: 30,
    devices: 10,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 50000, // MB
    bandwidth_files: 500,
    bandwidth_feature: 1,
    is_fair: 1,
    fair: 1,
    fair_files: 1,
    order: 3
  },
  {
    title: "Enterprise Mobile Solutions",
    description: "Advanced mobile firmware tools for businesses and repair shops. Includes bulk operations, team management, and enterprise support.",
    price: 99.99,
    actual_price: 149.99,
    marketing_text: "Premium Enterprise Package - 33% Discount",
    badge: "PREMIUM",
    period: 30,
    devices: 50,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 200000, // MB
    bandwidth_files: 2000,
    bandwidth_feature: 1,
    is_fair: 1,
    fair: 1,
    fair_files: 1,
    order: 4
  },
  {
    title: "Annual Basic Plan",
    description: "One year subscription to Basic Flasher with 2 months free. Perfect for regular users who want to save money long-term.",
    price: 99.99,
    actual_price: 119.88, // 9.99 * 12
    marketing_text: "Save 2 Months - Annual Special!",
    badge: "SAVE 17%",
    period: 365,
    devices: 3,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 5000,
    bandwidth_files: 50,
    bandwidth_feature: 1,
    is_fair: 0,
    fair: 0,
    fair_files: 0,
    order: 5
  },
  {
    title: "Annual Professional Plan",
    description: "One year subscription to Professional Firmware Suite with 3 months free. Best value for serious mobile technicians.",
    price: 299.99,
    actual_price: 389.88, // 29.99 * 13 (includes 1 month free)
    marketing_text: "Best Annual Deal - 3 Months FREE!",
    badge: "SAVE 23%",
    period: 365,
    devices: 10,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 50000,
    bandwidth_files: 500,
    bandwidth_feature: 1,
    is_fair: 1,
    fair: 1,
    fair_files: 1,
    order: 6
  },
  {
    title: "Samsung Specialist Package",
    description: "Dedicated Samsung firmware tools including Odin, Samsung-specific utilities, and exclusive Samsung firmware access. Perfect for Samsung device enthusiasts.",
    price: 19.99,
    actual_price: 24.99,
    marketing_text: "Samsung Exclusive - 20% OFF!",
    badge: "SPECIAL",
    period: 30,
    devices: 5,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 25000,
    bandwidth_files: 200,
    bandwidth_feature: 1,
    is_fair: 0,
    fair: 0,
    fair_files: 0,
    order: 7
  },
  {
    title: "Lifetime Professional Access",
    description: "One-time payment for lifetime access to all professional mobile firmware tools. Best investment for mobile technicians and repair professionals.",
    price: 499.99,
    actual_price: 599.99,
    marketing_text: "Pay Once, Use Forever - Limited Time Offer!",
    badge: "LIFETIME",
    period: 9999, // Lifetime
    devices: 10,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 50000,
    bandwidth_files: 500,
    bandwidth_feature: 1,
    is_fair: 1,
    fair: 1,
    fair_files: 1,
    order: 8
  }
];

async function seedDownloadPackages() {
  let connection;
  
  try {
    console.log('🌱 Starting to seed download packages...\n');
    
    connection = await pool.getConnection();
    
    // Clear existing packages
    console.log('🗑️  Clearing existing download packages...');
    await connection.execute('DELETE FROM res_download_packages');
    console.log('✅ Cleared existing packages\n');
    
    // Insert packages
    console.log('📦 Inserting download packages...\n');
    
    for (const pkg of downloadPackages) {
      const query = `
        INSERT INTO res_download_packages 
        (title, description, price, actual_price, marketing_text, badge, period, devices, is_public, is_active, 
        is_bandwidth, bandwidth, bandwidth_files, bandwidth_feature,
        is_fair, fair, fair_files, \`order\`, date_create, date_update) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;
      
      await connection.execute(query, [
        pkg.title,
        pkg.description,
        pkg.price,
        pkg.actual_price,
        pkg.marketing_text,
        pkg.badge,
        pkg.period,
        pkg.devices,
        pkg.is_public,
        pkg.is_active,
        pkg.is_bandwidth,
        pkg.bandwidth,
        pkg.bandwidth_files,
        pkg.bandwidth_feature,
        pkg.is_fair,
        pkg.fair,
        pkg.fair_files,
        pkg.order
      ]);
      
      const discount = pkg.actual_price && pkg.actual_price > pkg.price 
        ? ` (${Math.round(((pkg.actual_price - pkg.price) / pkg.actual_price) * 100)}% OFF)`
        : '';
      console.log(`  ✅ Created: ${pkg.title} - $${pkg.price}${discount}`);
    }
    
    console.log('\n🎉 Successfully seeded download packages!\n');
    
    // Display statistics
    const [totalResult] = await connection.execute('SELECT COUNT(*) as count FROM res_download_packages');
    const [freeResult] = await connection.execute('SELECT COUNT(*) as count FROM res_download_packages WHERE price = 0');
    const [paidResult] = await connection.execute('SELECT COUNT(*) as count FROM res_download_packages WHERE price > 0');
    const [activeResult] = await connection.execute('SELECT COUNT(*) as count FROM res_download_packages WHERE is_active = 1');
    const [publicResult] = await connection.execute('SELECT COUNT(*) as count FROM res_download_packages WHERE is_public = 1');
    const [discountResult] = await connection.execute('SELECT COUNT(*) as count FROM res_download_packages WHERE actual_price IS NOT NULL AND actual_price > price');
    
    console.log('📊 Package Statistics:');
    console.log(`   Total Packages: ${totalResult[0].count}`);
    console.log(`   Free Packages: ${freeResult[0].count}`);
    console.log(`   Paid Packages: ${paidResult[0].count}`);
    console.log(`   Active Packages: ${activeResult[0].count}`);
    console.log(`   Public Packages: ${publicResult[0].count}`);
    console.log(`   Packages with Discounts: ${discountResult[0].count}\n`);
    
    // Price range statistics
    const [priceStats] = await connection.execute(`
      SELECT 
        COUNT(*) as count,
        MIN(price) as min_price,
        MAX(price) as max_price,
        AVG(price) as avg_price
      FROM res_download_packages
      WHERE price > 0
    `);
    
    if (priceStats[0].count > 0) {
      console.log('💰 Price Statistics:');
      console.log(`   Price Range: $${priceStats[0].min_price} - $${priceStats[0].max_price}`);
      console.log(`   Average Price: $${parseFloat(priceStats[0].avg_price).toFixed(2)}\n`);
    }
    
    // Show all packages
    console.log('📦 All Packages:');
    const [packages] = await connection.execute(`
      SELECT title, price, actual_price, badge, period, devices, marketing_text
      FROM res_download_packages
      ORDER BY \`order\` ASC
    `);
    
    packages.forEach((pkg, index) => {
      const periodText = pkg.period === 9999 ? 'Lifetime' : `${pkg.period} days`;
      const priceText = pkg.price === 0 ? 'FREE' : `$${pkg.price}`;
      const discountText = pkg.actual_price && pkg.actual_price > pkg.price 
        ? ` (was $${pkg.actual_price})` 
        : '';
      const badgeText = pkg.badge ? ` [${pkg.badge}]` : '';
      const marketingText = pkg.marketing_text ? ` - ${pkg.marketing_text}` : '';
      
      console.log(`   ${index + 1}. ${pkg.title}${badgeText}`);
      console.log(`      ${priceText}${discountText} | ${periodText} | ${pkg.devices} devices${marketingText}`);
    });
    
  } catch (error) {
    console.error('❌ Error seeding download packages:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Run the seed function
seedDownloadPackages()
  .then(() => {
    console.log('\n✅ Seed completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  });

