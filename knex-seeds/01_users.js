const { faker } = require('@faker-js/faker');
const bcrypt = require('bcrypt');

// Countries data for realistic user generation
const countries = [
  { code: 'US', dial_code: '+1', name: 'United States' },
  { code: 'IN', dial_code: '+91', name: 'India' },
  { code: 'CN', dial_code: '+86', name: 'China' },
  { code: 'BR', dial_code: '+55', name: 'Brazil' },
  { code: 'ID', dial_code: '+62', name: 'Indonesia' },
  { code: 'PK', dial_code: '+92', name: 'Pakistan' },
  { code: 'BD', dial_code: '+880', name: 'Bangladesh' },
  { code: 'NG', dial_code: '+234', name: 'Nigeria' },
  { code: 'RU', dial_code: '+7', name: 'Russia' },
  { code: 'MX', dial_code: '+52', name: 'Mexico' },
  { code: 'JP', dial_code: '+81', name: 'Japan' },
  { code: 'PH', dial_code: '+63', name: 'Philippines' },
  { code: 'VN', dial_code: '+84', name: 'Vietnam' },
  { code: 'TR', dial_code: '+90', name: 'Turkey' },
  { code: 'EG', dial_code: '+20', name: 'Egypt' },
  { code: 'IR', dial_code: '+98', name: 'Iran' },
  { code: 'DE', dial_code: '+49', name: 'Germany' },
  { code: 'TH', dial_code: '+66', name: 'Thailand' },
  { code: 'GB', dial_code: '+44', name: 'United Kingdom' },
  { code: 'FR', dial_code: '+33', name: 'France' },
  { code: 'IT', dial_code: '+39', name: 'Italy' },
  { code: 'KR', dial_code: '+82', name: 'South Korea' },
  { code: 'ES', dial_code: '+34', name: 'Spain' },
  { code: 'PL', dial_code: '+48', name: 'Poland' },
  { code: 'CA', dial_code: '+1', name: 'Canada' },
  { code: 'AU', dial_code: '+61', name: 'Australia' },
  { code: 'AR', dial_code: '+54', name: 'Argentina' },
  { code: 'SA', dial_code: '+966', name: 'Saudi Arabia' },
  { code: 'AE', dial_code: '+971', name: 'United Arab Emirates' },
  { code: 'MY', dial_code: '+60', name: 'Malaysia' }
];

// Mobile firmware related usernames and interests
const firmwareInterests = [
  'samsung_flash', 'xiaomi_firmware', 'oneplus_rom', 'android_root',
  'custom_rom', 'stock_firmware', 'flash_tools', 'bootloader_unlock',
  'recovery_mode', 'fastboot_mode', 'odin_flash', 'mi_flash',
  'sp_flash', 'twrp_recovery', 'magisk_root', 'xposed_framework',
  'lineage_os', 'pixel_experience', 'evolution_x', 'arrow_os',
  'android_debug', 'adb_fastboot', 'usb_drivers', 'firmware_download'
];

// Generate realistic phone numbers based on country (digits only, shorter format)
function generatePhoneNumber(country) {
  // Generate phone numbers as digits only to fit database column
  const patterns = {
    'US': () => faker.string.numeric(10), // 10 digits
    'IN': () => faker.string.numeric(10), // 10 digits
    'CN': () => faker.string.numeric(11), // 11 digits
    'BR': () => faker.string.numeric(11), // 11 digits
    'ID': () => faker.string.numeric(10), // 10 digits
    'PK': () => faker.string.numeric(10), // 10 digits
    'BD': () => faker.string.numeric(10), // 10 digits
    'NG': () => faker.string.numeric(10), // 10 digits
    'RU': () => faker.string.numeric(10), // 10 digits
    'MX': () => faker.string.numeric(10), // 10 digits
    'JP': () => faker.string.numeric(10), // 10 digits
    'PH': () => faker.string.numeric(10), // 10 digits
    'VN': () => faker.string.numeric(9),  // 9 digits
    'TR': () => faker.string.numeric(10), // 10 digits
    'EG': () => faker.string.numeric(10), // 10 digits
    'IR': () => faker.string.numeric(10), // 10 digits
    'DE': () => faker.string.numeric(10), // 10 digits
    'TH': () => faker.string.numeric(9),  // 9 digits
    'GB': () => faker.string.numeric(10), // 10 digits
    'FR': () => faker.string.numeric(9),  // 9 digits
    'IT': () => faker.string.numeric(10), // 10 digits
    'KR': () => faker.string.numeric(10), // 10 digits
    'ES': () => faker.string.numeric(9),  // 9 digits
    'PL': () => faker.string.numeric(9),  // 9 digits
    'CA': () => faker.string.numeric(10), // 10 digits
    'AU': () => faker.string.numeric(9),  // 9 digits
    'AR': () => faker.string.numeric(10), // 10 digits
    'SA': () => faker.string.numeric(9),  // 9 digits
    'AE': () => faker.string.numeric(9),  // 9 digits
    'MY': () => faker.string.numeric(9)   // 9 digits
  };
  
  // Generate phone number as digits only
  return patterns[country.code] ? patterns[country.code]() : faker.string.numeric(10);
}

// Generate realistic usernames for mobile firmware users
function generateUsername(firstName, lastName) {
  const interest = faker.helpers.arrayElement(firmwareInterests);
  const randomNum = faker.number.int({ min: 100, max: 9999 });
  
  const patterns = [
    `${firstName.toLowerCase()}_${lastName.toLowerCase()}`,
    `${firstName.toLowerCase()}${lastName.toLowerCase()}${randomNum}`,
    `${interest}_${randomNum}`,
    `${firstName.toLowerCase()}_${interest}`,
    `${lastName.toLowerCase()}_${randomNum}`,
    `${interest}_${firstName.toLowerCase()}`,
    `${firstName.toLowerCase()}${randomNum}`,
    `${lastName.toLowerCase()}${randomNum}`
  ];
  
  return faker.helpers.arrayElement(patterns);
}

// Generate realistic email domains for mobile tech users
const emailDomains = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'protonmail.com', 'icloud.com', 'aol.com', 'live.com',
  'mail.com', 'yandex.com', 'zoho.com', 'fastmail.com'
];

// Generate realistic balance based on user type
function generateBalance() {
  const rand = Math.random();
  
  if (rand < 0.6) {
    // 60% free users
    return 0.00;
  } else if (rand < 0.85) {
    // 25% users with small balance
    return faker.number.float({ min: 5, max: 99, fractionDigits: 2 });
  } else if (rand < 0.95) {
    // 10% users with medium balance
    return faker.number.float({ min: 100, max: 499, fractionDigits: 2 });
  } else {
    // 5% premium users
    return faker.number.float({ min: 500, max: 2000, fractionDigits: 2 });
  }
}

exports.seed = async function(knex) {
  console.log('🌱 Starting to seed 1000 users...');
  
  // Clear existing users (keep admin user if exists)
  await knex('res_users').where('user_id', '>', 1).del();
  
  // Generate 1000 users
  const users = [];
  const batchSize = 100; // Process in batches for better performance
  
  for (let i = 0; i < 1000; i++) {
    const country = faker.helpers.arrayElement(countries);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const username = generateUsername(firstName, lastName);
    const email = `${username}@${faker.helpers.arrayElement(emailDomains)}`;
    const phone = generatePhoneNumber(country);
    const balance = generateBalance();
    
    // Determine user status and verification based on probability
    const isEmailVerified = Math.random() < 0.85; // 85% verified
    const isMobileVerified = Math.random() < 0.70; // 70% verified
    const isActive = Math.random() < 0.95; // 95% active
    
    // Determine registration type
    const registerType = Math.random() < 0.90 ? 'email' : 'google';
    
    // Determine user type (assuming 1 = regular, 2 = premium)
    const userType = balance >= 500 ? 2 : 1;
    
    const user = {
      username: username,
      password: await bcrypt.hash('password123', 10), // Default password for all users
      email: email,
      first_name: firstName,
      last_name: lastName,
      phone: phone,
      dial_code: country.dial_code,
      country_code: country.code,
      user_type: userType,
      role_id: null,
      is_email_verified: isEmailVerified ? 1 : 0,
      is_mobile_verified: isMobileVerified ? 1 : 0,
      status: isActive ? 1 : 0,
      balance: balance,
      register_type: registerType,
      photo: registerType === 'google' ? faker.image.avatar() : null,
      ip_address: faker.internet.ip(),
      last_login_at: faker.date.recent({ days: 30 }),
      created_at: faker.date.past({ years: 2 }),
      updated_at: faker.date.recent({ days: 7 })
    };
    
    users.push(user);
    
    // Process in batches
    if (users.length >= batchSize) {
      await knex('res_users').insert(users);
      console.log(`✅ Inserted ${users.length} users (batch ${Math.floor(i / batchSize) + 1})`);
      users.length = 0; // Clear array
    }
  }
  
  // Insert remaining users
  if (users.length > 0) {
    await knex('res_users').insert(users);
    console.log(`✅ Inserted final batch of ${users.length} users`);
  }
  
  console.log('🎉 Successfully seeded 1000 users!');
  
  // Display statistics
  const totalUsers = await knex('res_users').count('* as count').first();
  const verifiedUsers = await knex('res_users').where('is_email_verified', 1).count('* as count').first();
  const activeUsers = await knex('res_users').where('status', 1).count('* as count').first();
  const premiumUsers = await knex('res_users').where('user_type', 2).count('* as count').first();
  const googleUsers = await knex('res_users').where('register_type', 'google').count('* as count').first();
  
  console.log('\n📊 User Statistics:');
  console.log(`   Total Users: ${totalUsers.count}`);
  console.log(`   Verified Users: ${verifiedUsers.count}`);
  console.log(`   Active Users: ${activeUsers.count}`);
  console.log(`   Premium Users: ${premiumUsers.count}`);
  console.log(`   Google Users: ${googleUsers.count}`);
  
  // Country distribution
  const countryStats = await knex('res_users')
    .select('country_code')
    .count('* as count')
    .groupBy('country_code')
    .orderBy('count', 'desc')
    .limit(10);
  
  console.log('\n🌍 Top 10 Countries:');
  countryStats.forEach(stat => {
    const countryName = countries.find(c => c.code === stat.country_code)?.name || stat.country_code;
    console.log(`   ${countryName} (${stat.country_code}): ${stat.count} users`);
  });
};
