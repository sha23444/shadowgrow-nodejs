const { faker } = require('@faker-js/faker');

// Mobile firmware subscription packages
const downloadPackages = [
  // Free Tier
  {
    title: "Free Mobile Tools",
    description: "Access to basic mobile firmware tools and utilities. Perfect for beginners who want to explore mobile flashing.",
    price: 0.00,
    period: 30, // days
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
  
  // Basic Tier
  {
    title: "Basic Flasher",
    description: "Essential mobile firmware flashing tools with limited downloads. Great for occasional users who need reliable flashing solutions.",
    price: 9.99,
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
  
  // Professional Tier
  {
    title: "Professional Firmware Suite",
    description: "Complete mobile firmware solution with advanced tools, unlimited downloads, and priority support. Perfect for mobile technicians.",
    price: 29.99,
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
  
  // Enterprise Tier
  {
    title: "Enterprise Mobile Solutions",
    description: "Advanced mobile firmware tools for businesses and repair shops. Includes bulk operations, team management, and enterprise support.",
    price: 99.99,
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
  
  // Annual Plans
  {
    title: "Basic Flasher Annual",
    description: "One year subscription to Basic Flasher with 2 months free. Perfect for regular users who want to save money.",
    price: 99.99,
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
    title: "Professional Firmware Annual",
    description: "One year subscription to Professional Firmware Suite with 3 months free. Best value for serious mobile technicians.",
    price: 299.99,
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
  
  // Specialized Packages
  {
    title: "Samsung Specialist",
    description: "Dedicated Samsung firmware tools including Odin, Samsung-specific utilities, and exclusive Samsung firmware access.",
    price: 19.99,
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
    title: "Xiaomi & OnePlus Expert",
    description: "Specialized tools for Xiaomi and OnePlus devices including MI Flash, OnePlus specific utilities, and custom ROM support.",
    price: 24.99,
    period: 30,
    devices: 5,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 30000,
    bandwidth_files: 250,
    bandwidth_feature: 1,
    is_fair: 0,
    fair: 0,
    fair_files: 0,
    order: 8
  },
  
  {
    title: "Custom ROM Developer",
    description: "Advanced tools for custom ROM development including decompiling, modding tools, and developer resources.",
    price: 39.99,
    period: 30,
    devices: 15,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 75000,
    bandwidth_files: 750,
    bandwidth_feature: 1,
    is_fair: 1,
    fair: 1,
    fair_files: 1,
    order: 9
  },
  
  // Lifetime Packages
  {
    title: "Lifetime Basic Access",
    description: "One-time payment for lifetime access to basic mobile firmware tools. No recurring fees, perfect for personal use.",
    price: 199.99,
    period: 9999, // Lifetime
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
    order: 10
  },
  
  {
    title: "Lifetime Professional Access",
    description: "One-time payment for lifetime access to all professional mobile firmware tools. Best investment for mobile technicians.",
    price: 499.99,
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
    order: 11
  },
  
  // Student/Educational Packages
  {
    title: "Student Mobile Tools",
    description: "Discounted mobile firmware tools for students and educational institutions. Valid student ID required.",
    price: 4.99,
    period: 30,
    devices: 2,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 2500,
    bandwidth_files: 25,
    bandwidth_feature: 0,
    is_fair: 0,
    fair: 0,
    fair_files: 0,
    order: 12
  },
  
  // Trial Packages
  {
    title: "7-Day Trial Professional",
    description: "7-day trial of Professional Firmware Suite. Experience all features before committing to a full subscription.",
    price: 0.00,
    period: 7,
    devices: 3,
    is_public: 1,
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 10000,
    bandwidth_files: 100,
    bandwidth_feature: 1,
    is_fair: 0,
    fair: 0,
    fair_files: 0,
    order: 13
  },
  
  // Premium Features Package
  {
    title: "Premium Features Add-on",
    description: "Add premium features to any existing package. Includes advanced debugging tools, priority support, and exclusive firmware access.",
    price: 14.99,
    period: 30,
    devices: 0, // Add-on doesn't add devices
    is_public: 1,
    is_active: 1,
    is_bandwidth: 0,
    bandwidth: 0,
    bandwidth_files: 0,
    bandwidth_feature: 1,
    is_fair: 1,
    fair: 1,
    fair_files: 1,
    order: 14
  },
  
  // Bulk/Reseller Package
  {
    title: "Reseller Package",
    description: "Special package for mobile repair shops and resellers. Includes bulk operations, white-label options, and reseller support.",
    price: 199.99,
    period: 30,
    devices: 100,
    is_public: 0, // Not public, requires approval
    is_active: 1,
    is_bandwidth: 1,
    bandwidth: 500000,
    bandwidth_files: 5000,
    bandwidth_feature: 1,
    is_fair: 1,
    fair: 1,
    fair_files: 1,
    order: 15
  }
];

exports.seed = async function(knex) {
  console.log('🌱 Starting to seed download packages...');
  
  // Clear existing packages
  await knex('res_download_packages').del();
  
  // Insert packages
  console.log('📦 Inserting download packages...');
  
  for (const pkg of downloadPackages) {
    await knex('res_download_packages').insert({
      title: pkg.title,
      description: pkg.description,
      price: pkg.price,
      period: pkg.period,
      devices: pkg.devices,
      is_public: pkg.is_public,
      is_active: pkg.is_active,
      is_bandwidth: pkg.is_bandwidth,
      bandwidth: pkg.bandwidth,
      bandwidth_files: pkg.bandwidth_files,
      bandwidth_feature: pkg.bandwidth_feature,
      is_fair: pkg.is_fair,
      fair: pkg.fair,
      fair_files: pkg.fair_files,
      order: pkg.order,
      date_create: faker.date.past({ years: 1 }),
      date_update: faker.date.recent({ days: 30 })
    });
    
    console.log(`  ✅ Created package: ${pkg.title} - $${pkg.price}`);
  }
  
  console.log('🎉 Successfully seeded download packages!');
  
  // Display statistics
  const totalPackages = await knex('res_download_packages').count('* as count').first();
  const freePackages = await knex('res_download_packages').where('price', 0).count('* as count').first();
  const paidPackages = await knex('res_download_packages').where('price', '>', 0).count('* as count').first();
  const activePackages = await knex('res_download_packages').where('is_active', 1).count('* as count').first();
  const publicPackages = await knex('res_download_packages').where('is_public', 1).count('* as count').first();
  
  console.log('\n📊 Package Statistics:');
  console.log(`   Total Packages: ${totalPackages.count}`);
  console.log(`   Free Packages: ${freePackages.count}`);
  console.log(`   Paid Packages: ${paidPackages.count}`);
  console.log(`   Active Packages: ${activePackages.count}`);
  console.log(`   Public Packages: ${publicPackages.count}`);
  
  // Price range statistics
  const priceStats = await knex('res_download_packages')
    .select(
      knex.raw('COUNT(*) as count'),
      knex.raw('MIN(price) as min_price'),
      knex.raw('MAX(price) as max_price'),
      knex.raw('AVG(price) as avg_price')
    )
    .where('price', '>', 0)
    .first();
  
  console.log('\n💰 Price Statistics:');
  console.log(`   Price Range: $${priceStats.min_price} - $${priceStats.max_price}`);
  console.log(`   Average Price: $${parseFloat(priceStats.avg_price).toFixed(2)}`);
  
  // Period statistics
  const periodStats = await knex('res_download_packages')
    .select('period')
    .count('* as count')
    .groupBy('period')
    .orderBy('period', 'asc');
  
  console.log('\n⏰ Period Distribution:');
  periodStats.forEach(stat => {
    const periodText = stat.period === 9999 ? 'Lifetime' : `${stat.period} days`;
    console.log(`   ${periodText}: ${stat.count} packages`);
  });
  
  // Show sample packages
  console.log('\n📦 Sample Packages:');
  const samplePackages = await knex('res_download_packages')
    .select('title', 'price', 'period', 'devices')
    .orderBy('order', 'asc')
    .limit(5);
  
  samplePackages.forEach(pkg => {
    const periodText = pkg.period === 9999 ? 'Lifetime' : `${pkg.period} days`;
    const priceText = pkg.price === 0 ? 'FREE' : `$${pkg.price}`;
    console.log(`   📄 ${pkg.title} - ${priceText} (${periodText}, ${pkg.devices} devices)`);
  });
};
