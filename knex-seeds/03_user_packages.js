const { faker } = require('@faker-js/faker');

exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex('res_upackages').del();

  // Get existing users and packages
  const users = await knex('res_users').select('user_id').limit(500); // Limit to first 500 users
  const packages = await knex('res_download_packages').select('*');

  if (users.length === 0 || packages.length === 0) {
    console.log('⚠️  No users or packages found. Please run users and packages seeds first.');
    return;
  }

  console.log(`📦 Creating user packages for ${users.length} users with ${packages.length} available packages...`);

  const userPackages = [];
  const packageDistribution = {
    // Free packages - 40% of users
    free: 0.4,
    // Basic packages - 30% of users  
    basic: 0.3,
    // Professional packages - 20% of users
    professional: 0.2,
    // Enterprise packages - 10% of users
    enterprise: 0.1
  };

  // Categorize packages
  const packageCategories = {
    free: packages.filter(p => p.price === 0),
    basic: packages.filter(p => p.price > 0 && p.price <= 20),
    professional: packages.filter(p => p.price > 20 && p.price <= 100),
    enterprise: packages.filter(p => p.price > 100)
  };

  // Generate user packages
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const userIndex = i + 1;
    
    // Determine package category based on distribution
    let category;
    const rand = Math.random();
    if (rand < packageDistribution.free) {
      category = 'free';
    } else if (rand < packageDistribution.free + packageDistribution.basic) {
      category = 'basic';
    } else if (rand < packageDistribution.free + packageDistribution.basic + packageDistribution.professional) {
      category = 'professional';
    } else {
      category = 'enterprise';
    }

    // Select a random package from the category
    const availablePackages = packageCategories[category];
    if (availablePackages.length === 0) {
      // Fallback to any package if category is empty
      const randomPackage = packages[Math.floor(Math.random() * packages.length)];
      availablePackages.push(randomPackage);
    }

    const selectedPackage = availablePackages[Math.floor(Math.random() * availablePackages.length)];
    
    // Generate expiration date (some packages expired, some active, some future)
    const now = new Date();
    let expireDate;
    const expireRand = Math.random();
    
    if (expireRand < 0.2) {
      // 20% expired packages (1-90 days ago)
      expireDate = faker.date.between({
        from: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
        to: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
      });
    } else if (expireRand < 0.8) {
      // 60% active packages (1-30 days from now)
      expireDate = faker.date.between({
        from: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
        to: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      });
    } else {
      // 20% future packages (30-365 days from now)
      expireDate = faker.date.between({
        from: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        to: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      });
    }

    // Determine if package is active and current
    const isActive = expireDate > now;
    const isCurrent = isActive && Math.random() < 0.7; // 70% of active packages are current

    // Generate order ID (some packages have orders, some don't)
    // We'll set this to null for now and update it later with real order IDs
    const orderId = null;

    // Generate notes
    const notesOptions = [
      'Package purchased via website',
      'Admin assigned package',
      'Promotional package',
      'Free trial package',
      'Upgrade from previous package',
      'Gift package',
      'Referral bonus package',
      'Special offer package'
    ];

    const userPackage = {
      package_id: selectedPackage.package_id,
      order_id: orderId,
      package_title: selectedPackage.title,
      package_object: JSON.stringify(selectedPackage),
      user_id: user.user_id,
      bandwidth: selectedPackage.bandwidth,
      bandwidth_files: selectedPackage.bandwidth_files,
      extra: selectedPackage.extra,
      extra_files: selectedPackage.extra_files,
      fair: selectedPackage.fair,
      fair_files: selectedPackage.fair_files,
      devices: selectedPackage.devices,
      is_current: isCurrent ? 1 : 0,
      is_active: isActive ? 1 : 0,
      date_expire: expireDate,
      notes: faker.helpers.arrayElement(notesOptions),
      date_create: faker.date.between({
        from: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
        to: now
      })
    };

    userPackages.push(userPackage);

    // Log progress every 100 users
    if (userIndex % 100 === 0) {
      console.log(`  ✅ Processed ${userIndex}/${users.length} users`);
    }
  }

  // Insert user packages in batches
  const batchSize = 100;
  for (let i = 0; i < userPackages.length; i += batchSize) {
    const batch = userPackages.slice(i, i + batchSize);
    await knex('res_upackages').insert(batch);
    console.log(`  📦 Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(userPackages.length / batchSize)}`);
  }

  // Generate summary statistics
  const totalPackages = userPackages.length;
  const activePackages = userPackages.filter(p => p.is_active === 1).length;
  const currentPackages = userPackages.filter(p => p.is_current === 1).length;
  const expiredPackages = userPackages.filter(p => p.is_active === 0).length;

  console.log(`\n🎉 Successfully created ${totalPackages} user packages!`);
  console.log(`📊 Summary:`);
  console.log(`   - Active packages: ${activePackages} (${((activePackages/totalPackages)*100).toFixed(1)}%)`);
  console.log(`   - Current packages: ${currentPackages} (${((currentPackages/totalPackages)*100).toFixed(1)}%)`);
  console.log(`   - Expired packages: ${expiredPackages} (${((expiredPackages/totalPackages)*100).toFixed(1)}%)`);
  
  // Package category distribution
  const categoryStats = {};
  userPackages.forEach(up => {
    const pkg = JSON.parse(up.package_object);
    if (pkg.price === 0) {
      categoryStats.free = (categoryStats.free || 0) + 1;
    } else if (pkg.price <= 20) {
      categoryStats.basic = (categoryStats.basic || 0) + 1;
    } else if (pkg.price <= 100) {
      categoryStats.professional = (categoryStats.professional || 0) + 1;
    } else {
      categoryStats.enterprise = (categoryStats.enterprise || 0) + 1;
    }
  });

  console.log(`\n📈 Package Category Distribution:`);
  Object.entries(categoryStats).forEach(([category, count]) => {
    console.log(`   - ${category.charAt(0).toUpperCase() + category.slice(1)}: ${count} (${((count/totalPackages)*100).toFixed(1)}%)`);
  });

  console.log(`\n📱 Mobile Firmware User Packages Created Successfully!`);
};
