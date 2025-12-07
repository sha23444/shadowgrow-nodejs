/**
 * Seed: Mobile Services
 * Description: Seed data for mobile unlocking and bypass services
 */

exports.seed = async function(knex) {
  // Delete existing mobile services to allow reseeding
  const existingSlugs = [
      'samsung-frp-bypass',
      'iphone-icloud-bypass',
      'xiaomi-account-unlock',
      'imei-blacklist-removal',
      'oppo-frp-removal',
      'vivo-account-unlock',
      'huawei-frp-bypass',
      'lg-google-account-removal',
      'android-pattern-lock-removal',
    'sim-lock-removal',
    'oneplus-frp-bypass',
    'realme-account-unlock',
    'motorola-frp-removal',
    'nokia-account-unlock',
    'android-bootloader-unlock',
    'android-rooting-service',
    'custom-rom-installation',
    'mobile-data-recovery',
    'screen-unlock-service',
    'samsung-knox-removal',
    'iphone-screen-repair',
    'battery-replacement-service',
    'water-damage-repair',
    'software-update-service',
    'imei-repair-service'
  ];

  // Delete existing services with these slugs
  await knex('res_services').whereIn('slug', existingSlugs).del();
  console.log('🧹 Cleaned up existing mobile services');

  const mobileServices = [
    {
      service_name: 'Samsung FRP Bypass Service',
      slug: 'samsung-frp-bypass',
      short_description: 'Professional Samsung FRP (Factory Reset Protection) bypass service. Unlock your Samsung device quickly and safely.',
      description: `Get your Samsung device unlocked with our professional FRP bypass service. Our expert technicians can remove Factory Reset Protection from various Samsung models including Galaxy S series, Note series, A series, and more.

Features:
• Works on all Samsung models
• Fast 24-48 hour delivery
• 100% success rate
• No data loss
• Support for Android versions 5.0 to 13

Perfect for when you've forgotten your Google account or purchased a second-hand device.`,
      features: JSON.stringify([
        'Works on all Samsung models',
        'Android 5.0 to 13 support',
        'Fast 24-48 hour delivery',
        '100% success guarantee',
        'No data loss',
        'Lifetime support'
      ]),
      requirements: JSON.stringify([
        'Device model and serial number',
        'Current Android version',
        'Proof of ownership (if required)'
      ]),
      deliverables: JSON.stringify([
        'FRP bypass completed',
        'Device unlocked and ready to use',
        'Step-by-step verification guide',
        'Support documentation'
      ]),
      base_price: 29.99,
      sale_price: 24.99,
      currency: 'USD',
      duration: '1-2 days',
      delivery_time: '24-48 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['samsung', 'frp', 'bypass', 'unlock', 'android']),
      meta_title: 'Samsung FRP Bypass Service - Quick & Reliable',
      meta_description: 'Professional Samsung FRP bypass service. Unlock your Samsung device in 24-48 hours. 100% success rate guaranteed.',
      status: 'active',
      sort_order: 1
    },
    {
      service_name: 'iPhone iCloud Bypass Service',
      slug: 'iphone-icloud-bypass',
      short_description: 'Professional iCloud bypass for locked iPhones. Remove iCloud activation lock and restore device functionality.',
      description: `Unlock your iPhone from iCloud activation lock with our professional bypass service. We support all iPhone models from iPhone 6 to iPhone 15 Pro Max.

Features:
• All iPhone models supported (6 to 15 Pro Max)
• iOS 12 to iOS 17 compatibility
• Bypass activation lock completely
• Remove Find My iPhone lock
• Fast delivery (24-72 hours)
• High success rate

Ideal for when you've forgotten your Apple ID credentials or purchased a device with an activation lock.`,
      features: JSON.stringify([
        'All iPhone models (6 to 15 Pro Max)',
        'iOS 12 to iOS 17 support',
        'Activation lock removal',
        'Find My iPhone bypass',
        '24-72 hour delivery',
        'High success rate'
      ]),
      requirements: JSON.stringify([
        'iPhone model and IMEI',
        'Current iOS version',
        'Device status (locked/unlocked)',
        'Proof of purchase (if required)'
      ]),
      deliverables: JSON.stringify([
        'iCloud bypass completed',
        'Device activation guide',
        'Verification instructions',
        'Support documentation'
      ]),
      base_price: 49.99,
      sale_price: 39.99,
      currency: 'USD',
      duration: '2-3 days',
      delivery_time: '24-72 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'premium',
      tags: JSON.stringify(['iphone', 'icloud', 'bypass', 'unlock', 'ios', 'activation-lock']),
      meta_title: 'iPhone iCloud Bypass Service - Remove Activation Lock',
      meta_description: 'Professional iPhone iCloud bypass service. Remove activation lock from all iPhone models. Fast 24-72 hour delivery.',
      status: 'active',
      sort_order: 2
    },
    {
      service_name: 'Xiaomi Account Unlock',
      slug: 'xiaomi-account-unlock',
      short_description: 'Unlock your Xiaomi device from Mi Account lock. Fast and reliable service for all Xiaomi models.',
      description: `Remove Mi Account lock from your Xiaomi device quickly and securely. Our service supports all Xiaomi, Redmi, and POCO devices.

Features:
• All Xiaomi/Redmi/POCO models
• MIUI 8 to MIUI 14 support
• Mi Account removal
• FRP bypass included
• Fast 12-24 hour delivery
• 100% success guarantee

Perfect solution for forgotten Mi Account credentials or second-hand devices.`,
      features: JSON.stringify([
        'Xiaomi/Redmi/POCO support',
        'MIUI 8 to 14 compatibility',
        'Mi Account removal',
        'FRP bypass included',
        '12-24 hour delivery',
        '100% success rate'
      ]),
      requirements: JSON.stringify([
        'Device model',
        'MIUI version',
        'Device IMEI',
        'Current lock status'
      ]),
      deliverables: JSON.stringify([
        'Mi Account unlock completed',
        'Device reset instructions',
        'Verification guide',
        'Support documentation'
      ]),
      base_price: 19.99,
      sale_price: 15.99,
      currency: 'USD',
      duration: '1 day',
      delivery_time: '12-24 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['xiaomi', 'redmi', 'poco', 'mi-account', 'unlock', 'frp']),
      meta_title: 'Xiaomi Account Unlock Service - Fast & Reliable',
      meta_description: 'Professional Xiaomi account unlock service. Remove Mi Account lock from all Xiaomi devices in 12-24 hours.',
      status: 'active',
      sort_order: 3
    },
    {
      service_name: 'IMEI Blacklist Removal',
      slug: 'imei-blacklist-removal',
      short_description: 'Remove your device from blacklist databases. Unlock blacklisted phones and restore functionality.',
      description: `Get your device removed from carrier blacklists and restore full functionality. We work with all major carriers and device brands.

Features:
• All major carriers supported
• Samsung, iPhone, Xiaomi, and more
• Remove from GSMA blacklist
• Carrier database cleanup
• Fast 3-7 day processing
• Professional verification

Essential service if your device was reported lost/stolen or has payment issues.`,
      features: JSON.stringify([
        'All major carriers',
        'All device brands',
        'GSMA blacklist removal',
        'Carrier database cleanup',
        '3-7 day processing',
        'Professional verification'
      ]),
      requirements: JSON.stringify([
        'Device IMEI number',
        'Device model',
        'Current carrier',
        'Blacklist reason (if known)',
        'Proof of ownership'
      ]),
      deliverables: JSON.stringify([
        'Blacklist removal confirmation',
        'Device verification guide',
        'Carrier update instructions',
        'Support documentation'
      ]),
      base_price: 79.99,
      sale_price: 69.99,
      currency: 'USD',
      duration: '5-7 days',
      delivery_time: '3-7 business days',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: true,
      is_customizable: false,
      service_type: 'premium',
      tags: JSON.stringify(['imei', 'blacklist', 'removal', 'unlock', 'carrier', 'gsma']),
      meta_title: 'IMEI Blacklist Removal Service - Professional Unlock',
      meta_description: 'Professional IMEI blacklist removal service. Remove your device from carrier blacklists. All brands and carriers supported.',
      status: 'active',
      sort_order: 4
    },
    {
      service_name: 'OPPO FRP Removal',
      slug: 'oppo-frp-removal',
      short_description: 'Remove Factory Reset Protection from OPPO devices. Quick and reliable FRP unlock service.',
      description: `Unlock your OPPO device from FRP lock with our specialized service. Supports all OPPO models including Find series, Reno series, and A series.

Features:
• All OPPO models supported
• ColorOS 6 to ColorOS 13
• Fast 24-48 hour delivery
• No data loss guarantee
• 100% success rate

Great for forgotten Google account or factory reset issues.`,
      features: JSON.stringify([
        'All OPPO models',
        'ColorOS 6 to 13',
        '24-48 hour delivery',
        'No data loss',
        '100% success rate',
        'Expert support'
      ]),
      requirements: JSON.stringify([
        'OPPO model name',
        'ColorOS version',
        'Device IMEI'
      ]),
      deliverables: JSON.stringify([
        'FRP removal completed',
        'Unlock instructions',
        'Verification guide'
      ]),
      base_price: 24.99,
      sale_price: 19.99,
      currency: 'USD',
      duration: '1-2 days',
      delivery_time: '24-48 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: false,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['oppo', 'frp', 'removal', 'unlock', 'coloros']),
      meta_title: 'OPPO FRP Removal Service - Fast Unlock',
      meta_description: 'Professional OPPO FRP removal service. Unlock your OPPO device from Factory Reset Protection in 24-48 hours.',
      status: 'active',
      sort_order: 5
    },
    {
      service_name: 'Vivo Account Unlock',
      slug: 'vivo-account-unlock',
      short_description: 'Remove Vivo account lock from your device. Fast unlock service for all Vivo models.',
      description: `Unlock your Vivo device from account lock quickly and securely. We support all Vivo models including V series, X series, Y series, and more.

Features:
• All Vivo models
• Funtouch OS support
• Account lock removal
• Fast 12-24 hour service
• High success rate

Perfect solution for locked Vivo devices.`,
      features: JSON.stringify([
        'All Vivo models',
        'Funtouch OS support',
        '12-24 hour delivery',
        'High success rate',
        'Secure process'
      ]),
      requirements: JSON.stringify([
        'Vivo model name',
        'Funtouch OS version',
        'Device IMEI'
      ]),
      deliverables: JSON.stringify([
        'Account unlock completed',
        'Device setup guide',
        'Verification instructions'
      ]),
      base_price: 22.99,
      sale_price: 18.99,
      currency: 'USD',
      duration: '1 day',
      delivery_time: '12-24 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: false,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['vivo', 'account', 'unlock', 'funtouch-os']),
      meta_title: 'Vivo Account Unlock Service',
      meta_description: 'Professional Vivo account unlock service. Remove account lock from all Vivo devices quickly.',
      status: 'active',
      sort_order: 6
    },
    {
      service_name: 'Huawei FRP Bypass',
      slug: 'huawei-frp-bypass',
      short_description: 'Professional Huawei FRP bypass service. Unlock Huawei devices from Factory Reset Protection.',
      description: `Remove FRP lock from your Huawei device with our expert service. Supports all Huawei and Honor models including P series, Mate series, Nova series, and more.

Features:
• Huawei and Honor models
• EMUI 8 to EMUI 12 support
• Fast 24-48 hour delivery
• Secure bypass method
• 100% success guarantee

Ideal for locked Huawei devices after factory reset.`,
      features: JSON.stringify([
        'Huawei & Honor support',
        'EMUI 8 to 12',
        '24-48 hour delivery',
        'Secure process',
        '100% success rate'
      ]),
      requirements: JSON.stringify([
        'Device model',
        'EMUI version',
        'Device IMEI'
      ]),
      deliverables: JSON.stringify([
        'FRP bypass completed',
        'Unlock instructions',
        'Setup guide'
      ]),
      base_price: 27.99,
      sale_price: 22.99,
      currency: 'USD',
      duration: '1-2 days',
      delivery_time: '24-48 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: false,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['huawei', 'honor', 'frp', 'bypass', 'emui']),
      meta_title: 'Huawei FRP Bypass Service - Professional Unlock',
      meta_description: 'Professional Huawei FRP bypass service. Unlock Huawei and Honor devices from Factory Reset Protection.',
      status: 'active',
      sort_order: 7
    },
    {
      service_name: 'LG Google Account Removal',
      slug: 'lg-google-account-removal',
      short_description: 'Remove Google Account lock from LG devices. Professional unlock service for all LG models.',
      description: `Unlock your LG device from Google Account lock quickly. Supports all LG smartphone models including G series, V series, and K series.

Features:
• All LG smartphone models
• Android 6.0 to 12 support
• Google Account removal
• Fast 24-48 hour service
• Reliable unlock method

Perfect for forgotten Google credentials on LG devices.`,
      features: JSON.stringify([
        'All LG models',
        'Android 6.0 to 12',
        '24-48 hour delivery',
        'Reliable method',
        'Expert support'
      ]),
      requirements: JSON.stringify([
        'LG model name',
        'Android version',
        'Device IMEI'
      ]),
      deliverables: JSON.stringify([
        'Google Account removed',
        'Unlock guide',
        'Setup instructions'
      ]),
      base_price: 23.99,
      sale_price: 19.99,
      currency: 'USD',
      duration: '1-2 days',
      delivery_time: '24-48 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: false,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['lg', 'google-account', 'removal', 'unlock']),
      meta_title: 'LG Google Account Removal Service',
      meta_description: 'Professional LG Google Account removal service. Unlock all LG devices from account lock.',
      status: 'active',
      sort_order: 8
    },
    {
      service_name: 'Android Pattern Lock Removal',
      slug: 'android-pattern-lock-removal',
      short_description: 'Remove pattern lock from any Android device. Fast unlock service without data loss.',
      description: `Forgot your pattern lock? We can remove it from any Android device without losing your data. Supports all Android brands and models.

Features:
• All Android devices
• Pattern lock removal
• PIN lock removal
• Password lock removal
• No data loss guarantee
• Fast 12-24 hour service

Perfect solution when you've forgotten your lock screen pattern, PIN, or password.`,
      features: JSON.stringify([
        'All Android devices',
        'Pattern/PIN/Password removal',
        'No data loss',
        '12-24 hour delivery',
        '100% success rate',
        'All brands supported'
      ]),
      requirements: JSON.stringify([
        'Device brand and model',
        'Android version',
        'Lock type (pattern/PIN/password)',
        'USB debugging enabled (if possible)'
      ]),
      deliverables: JSON.stringify([
        'Lock removed successfully',
        'Device access restored',
        'Data preservation confirmation',
        'Security setup guide'
      ]),
      base_price: 19.99,
      sale_price: 15.99,
      currency: 'USD',
      duration: '1 day',
      delivery_time: '12-24 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['android', 'pattern-lock', 'pin-lock', 'password-lock', 'unlock', 'no-data-loss']),
      meta_title: 'Android Pattern Lock Removal - No Data Loss',
      meta_description: 'Professional Android pattern lock removal service. Remove pattern, PIN, or password lock without losing data.',
      status: 'active',
      sort_order: 9
    },
    {
      service_name: 'SIM Lock Removal',
      slug: 'sim-lock-removal',
      short_description: 'Unlock your device from carrier SIM lock. Use any SIM card on your unlocked device.',
      description: `Remove carrier SIM lock from your device and use it with any carrier worldwide. Supports all major carriers and device brands.

Features:
• All device brands
• All major carriers
• Network unlock code
• Permanent unlock
• Fast 24-72 hour delivery
• Works worldwide

Perfect when you want to switch carriers or use your device internationally.`,
      features: JSON.stringify([
        'All brands & carriers',
        'Permanent unlock',
        '24-72 hour delivery',
        'Worldwide compatibility',
        'Network unlock code',
        'Expert verification'
      ]),
      requirements: JSON.stringify([
        'Device IMEI',
        'Device brand and model',
        'Current carrier',
        'Country/region'
      ]),
      deliverables: JSON.stringify([
        'Unlock code provided',
        'Unlock instructions',
        'Verification guide',
        'Support documentation'
      ]),
      base_price: 34.99,
      sale_price: 29.99,
      currency: 'USD',
      duration: '2-3 days',
      delivery_time: '24-72 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['sim-lock', 'carrier-unlock', 'network-unlock', 'imei-unlock']),
      meta_title: 'SIM Lock Removal Service - Carrier Unlock',
      meta_description: 'Professional SIM lock removal service. Unlock your device from carrier lock and use any SIM card worldwide.',
      status: 'active',
      sort_order: 10
    },
    {
      service_name: 'OnePlus FRP Bypass',
      slug: 'oneplus-frp-bypass',
      short_description: 'Remove Factory Reset Protection from OnePlus devices. Fast and reliable FRP unlock service.',
      description: `Unlock your OnePlus device from FRP lock with our specialized service. Supports all OnePlus models including OnePlus 7, 8, 9, 10, 11, and Nord series.

Features:
• All OnePlus models supported
• OxygenOS 9 to OxygenOS 14
• Fast 24-48 hour delivery
• No data loss guarantee
• 100% success rate

Perfect for forgotten Google account or factory reset issues on OnePlus devices.`,
      features: JSON.stringify([
        'All OnePlus models',
        'OxygenOS 9 to 14',
        '24-48 hour delivery',
        'No data loss',
        '100% success rate',
        'Expert support'
      ]),
      requirements: JSON.stringify([
        'OnePlus model name',
        'OxygenOS version',
        'Device IMEI'
      ]),
      deliverables: JSON.stringify([
        'FRP bypass completed',
        'Unlock instructions',
        'Verification guide'
      ]),
      base_price: 26.99,
      sale_price: 21.99,
      currency: 'USD',
      duration: '1-2 days',
      delivery_time: '24-48 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: false,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['oneplus', 'frp', 'bypass', 'unlock', 'oxygenos']),
      meta_title: 'OnePlus FRP Bypass Service - Fast Unlock',
      meta_description: 'Professional OnePlus FRP bypass service. Unlock your OnePlus device from Factory Reset Protection in 24-48 hours.',
      status: 'active',
      sort_order: 11
    },
    {
      service_name: 'Realme Account Unlock',
      slug: 'realme-account-unlock',
      short_description: 'Remove Realme account lock from your device. Fast unlock service for all Realme models.',
      description: `Unlock your Realme device from account lock quickly and securely. We support all Realme models including Realme GT series, Realme X series, Realme C series, and more.

Features:
• All Realme models
• Realme UI 1.0 to Realme UI 5.0 support
• Account lock removal
• Fast 12-24 hour service
• High success rate

Perfect solution for locked Realme devices.`,
      features: JSON.stringify([
        'All Realme models',
        'Realme UI 1.0 to 5.0',
        '12-24 hour delivery',
        'High success rate',
        'Secure process'
      ]),
      requirements: JSON.stringify([
        'Realme model name',
        'Realme UI version',
        'Device IMEI'
      ]),
      deliverables: JSON.stringify([
        'Account unlock completed',
        'Device setup guide',
        'Verification instructions'
      ]),
      base_price: 21.99,
      sale_price: 17.99,
      currency: 'USD',
      duration: '1 day',
      delivery_time: '12-24 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: false,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['realme', 'account', 'unlock', 'realme-ui']),
      meta_title: 'Realme Account Unlock Service',
      meta_description: 'Professional Realme account unlock service. Remove account lock from all Realme devices quickly.',
      status: 'active',
      sort_order: 12
    },
    {
      service_name: 'Motorola FRP Removal',
      slug: 'motorola-frp-removal',
      short_description: 'Remove Factory Reset Protection from Motorola devices. Quick and reliable FRP unlock service.',
      description: `Unlock your Motorola device from FRP lock with our specialized service. Supports all Motorola models including Edge series, Moto G series, Moto E series, and more.

Features:
• All Motorola models supported
• Stock Android 8.0 to Android 14
• Fast 24-48 hour delivery
• No data loss guarantee
• 100% success rate

Great for forgotten Google account or factory reset issues on Motorola devices.`,
      features: JSON.stringify([
        'All Motorola models',
        'Android 8.0 to 14',
        '24-48 hour delivery',
        'No data loss',
        '100% success rate',
        'Expert support'
      ]),
      requirements: JSON.stringify([
        'Motorola model name',
        'Android version',
        'Device IMEI'
      ]),
      deliverables: JSON.stringify([
        'FRP removal completed',
        'Unlock instructions',
        'Verification guide'
      ]),
      base_price: 25.99,
      sale_price: 20.99,
      currency: 'USD',
      duration: '1-2 days',
      delivery_time: '24-48 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: false,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['motorola', 'frp', 'removal', 'unlock', 'android']),
      meta_title: 'Motorola FRP Removal Service - Fast Unlock',
      meta_description: 'Professional Motorola FRP removal service. Unlock your Motorola device from Factory Reset Protection in 24-48 hours.',
      status: 'active',
      sort_order: 13
    },
    {
      service_name: 'Nokia Account Unlock',
      slug: 'nokia-account-unlock',
      short_description: 'Remove Nokia account lock from your device. Fast unlock service for all Nokia models.',
      description: `Unlock your Nokia device from account lock quickly and securely. We support all Nokia smartphone models including Nokia X series, Nokia G series, and more.

Features:
• All Nokia smartphone models
• Android 9.0 to Android 14 support
• Account lock removal
• Fast 12-24 hour service
• High success rate

Perfect solution for locked Nokia devices.`,
      features: JSON.stringify([
        'All Nokia models',
        'Android 9.0 to 14',
        '12-24 hour delivery',
        'High success rate',
        'Secure process'
      ]),
      requirements: JSON.stringify([
        'Nokia model name',
        'Android version',
        'Device IMEI'
      ]),
      deliverables: JSON.stringify([
        'Account unlock completed',
        'Device setup guide',
        'Verification instructions'
      ]),
      base_price: 23.99,
      sale_price: 19.99,
      currency: 'USD',
      duration: '1 day',
      delivery_time: '12-24 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: false,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['nokia', 'account', 'unlock', 'android']),
      meta_title: 'Nokia Account Unlock Service',
      meta_description: 'Professional Nokia account unlock service. Remove account lock from all Nokia devices quickly.',
      status: 'active',
      sort_order: 14
    },
    {
      service_name: 'Android Bootloader Unlock',
      slug: 'android-bootloader-unlock',
      short_description: 'Unlock bootloader on Android devices. Enable custom ROM installation and advanced modifications.',
      description: `Unlock the bootloader on your Android device to enable custom ROM installation, root access, and advanced modifications. Supports all major Android brands.

Features:
• All Android brands supported
• Bootloader unlock code
• Custom recovery installation
• Fast 24-72 hour delivery
• Step-by-step guide included
• Warranty void warning provided

Perfect for advanced users who want to customize their Android device.`,
      features: JSON.stringify([
        'All Android brands',
        'Bootloader unlock code',
        'Custom recovery support',
        '24-72 hour delivery',
        'Detailed instructions',
        'Expert support'
      ]),
      requirements: JSON.stringify([
        'Device brand and model',
        'Android version',
        'Device IMEI',
        'OEM unlock enabled (if required)'
      ]),
      deliverables: JSON.stringify([
        'Bootloader unlock completed',
        'Unlock instructions',
        'Custom recovery guide',
        'Safety warnings'
      ]),
      base_price: 39.99,
      sale_price: 34.99,
      currency: 'USD',
      duration: '2-3 days',
      delivery_time: '24-72 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'premium',
      tags: JSON.stringify(['android', 'bootloader', 'unlock', 'custom-rom', 'root']),
      meta_title: 'Android Bootloader Unlock Service',
      meta_description: 'Professional Android bootloader unlock service. Unlock bootloader on all Android devices for custom ROM installation.',
      status: 'active',
      sort_order: 15
    },
    {
      service_name: 'Android Rooting Service',
      slug: 'android-rooting-service',
      short_description: 'Root your Android device safely. Get full system access and install root-only apps.',
      description: `Root your Android device safely with our professional rooting service. Get full system access, install root-only apps, and customize your device completely.

Features:
• All Android devices supported
• Safe rooting method
• Magisk or SuperSU installation
• No data loss guarantee
• Fast 24-48 hour delivery
• Root verification included

Perfect for users who want full control over their Android device.`,
      features: JSON.stringify([
        'All Android devices',
        'Safe rooting method',
        'Magisk/SuperSU support',
        'No data loss',
        '24-48 hour delivery',
        'Root verification'
      ]),
      requirements: JSON.stringify([
        'Device brand and model',
        'Android version',
        'Bootloader unlocked (if required)',
        'USB debugging enabled'
      ]),
      deliverables: JSON.stringify([
        'Device rooted successfully',
        'Root manager installed',
        'Verification guide',
        'Safety instructions'
      ]),
      base_price: 44.99,
      sale_price: 39.99,
      currency: 'USD',
      duration: '2-3 days',
      delivery_time: '24-48 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'premium',
      tags: JSON.stringify(['android', 'root', 'rooting', 'magisk', 'supersu', 'customization']),
      meta_title: 'Android Rooting Service - Safe Root Access',
      meta_description: 'Professional Android rooting service. Root your Android device safely and get full system access.',
      status: 'active',
      sort_order: 16
    },
    {
      service_name: 'Custom ROM Installation',
      slug: 'custom-rom-installation',
      short_description: 'Install custom ROM on your Android device. Get latest Android versions and custom features.',
      description: `Install a custom ROM on your Android device to get the latest Android versions, custom features, and improved performance. We support popular ROMs like LineageOS, Pixel Experience, and more.

Features:
• Popular custom ROMs supported
• Latest Android versions
• Improved performance
• Custom features
• Fast 48-72 hour delivery
• Full setup guide

Perfect for users who want the latest Android features on older devices.`,
      features: JSON.stringify([
        'LineageOS, Pixel Experience, etc.',
        'Latest Android versions',
        'Performance improvements',
        'Custom features',
        '48-72 hour delivery',
        'Full setup guide'
      ]),
      requirements: JSON.stringify([
        'Device brand and model',
        'Bootloader unlocked',
        'Custom recovery installed',
        'Device backup (recommended)'
      ]),
      deliverables: JSON.stringify([
        'Custom ROM installed',
        'Setup instructions',
        'Troubleshooting guide',
        'Support documentation'
      ]),
      base_price: 54.99,
      sale_price: 49.99,
      currency: 'USD',
      duration: '3-4 days',
      delivery_time: '48-72 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: true,
      is_customizable: true,
      service_type: 'premium',
      tags: JSON.stringify(['custom-rom', 'lineageos', 'pixel-experience', 'android', 'installation']),
      meta_title: 'Custom ROM Installation Service',
      meta_description: 'Professional custom ROM installation service. Install LineageOS, Pixel Experience, and other popular ROMs on your Android device.',
      status: 'active',
      sort_order: 17
    },
    {
      service_name: 'Mobile Data Recovery',
      slug: 'mobile-data-recovery',
      short_description: 'Recover lost data from your mobile device. Photos, contacts, messages, and more.',
      description: `Recover lost data from your mobile device including photos, videos, contacts, messages, WhatsApp chats, and documents. Works on both Android and iOS devices.

Features:
• Android and iOS support
• Photos and videos recovery
• Contacts and messages recovery
• WhatsApp data recovery
• Documents recovery
• Fast 24-72 hour delivery

Perfect when you've accidentally deleted important data or lost it due to device issues.`,
      features: JSON.stringify([
        'Android & iOS support',
        'Photos & videos recovery',
        'Contacts & messages',
        'WhatsApp data recovery',
        'Documents recovery',
        '24-72 hour delivery'
      ]),
      requirements: JSON.stringify([
        'Device brand and model',
        'Data loss scenario',
        'Device accessibility status',
        'Type of data to recover'
      ]),
      deliverables: JSON.stringify([
        'Recovered data files',
        'Recovery report',
        'Data backup instructions',
        'Prevention guide'
      ]),
      base_price: 69.99,
      sale_price: 59.99,
      currency: 'USD',
      duration: '3-5 days',
      delivery_time: '24-72 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: true,
      is_customizable: false,
      service_type: 'premium',
      tags: JSON.stringify(['data-recovery', 'mobile', 'android', 'ios', 'photos', 'whatsapp']),
      meta_title: 'Mobile Data Recovery Service',
      meta_description: 'Professional mobile data recovery service. Recover lost photos, contacts, messages, and WhatsApp data from Android and iOS devices.',
      status: 'active',
      sort_order: 18
    },
    {
      service_name: 'Screen Unlock Service',
      slug: 'screen-unlock-service',
      short_description: 'Unlock your device screen lock. Works with pattern, PIN, password, and biometric locks.',
      description: `Unlock your device screen lock quickly and securely. We support pattern locks, PIN locks, password locks, and can bypass biometric locks on various devices.

Features:
• Pattern, PIN, password unlock
• Biometric bypass support
• All Android and iOS devices
• Fast 12-24 hour delivery
• No data loss guarantee
• 100% success rate

Perfect when you've forgotten your screen lock or need to bypass biometric authentication.`,
      features: JSON.stringify([
        'Pattern/PIN/Password unlock',
        'Biometric bypass',
        'All Android & iOS devices',
        '12-24 hour delivery',
        'No data loss',
        '100% success rate'
      ]),
      requirements: JSON.stringify([
        'Device brand and model',
        'Lock type',
        'Android/iOS version',
        'USB debugging (if possible)'
      ]),
      deliverables: JSON.stringify([
        'Screen lock removed',
        'Device access restored',
        'Security setup guide',
        'Prevention tips'
      ]),
      base_price: 24.99,
      sale_price: 19.99,
      currency: 'USD',
      duration: '1 day',
      delivery_time: '12-24 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['screen-unlock', 'pattern-lock', 'pin-lock', 'biometric', 'android', 'ios']),
      meta_title: 'Screen Unlock Service - Fast & Secure',
      meta_description: 'Professional screen unlock service. Remove pattern, PIN, password, and biometric locks from Android and iOS devices.',
      status: 'active',
      sort_order: 19
    },
    {
      service_name: 'Samsung Knox Removal',
      slug: 'samsung-knox-removal',
      short_description: 'Remove Samsung Knox security from your device. Enable full device customization.',
      description: `Remove Samsung Knox security from your device to enable full customization, root access, and custom ROM installation. Works on all Samsung Galaxy devices.

Features:
• All Samsung Galaxy models
• Knox removal and reset
• Warranty void reset
• Fast 48-72 hour delivery
• Full customization enabled
• Expert support

Perfect for users who want to fully customize their Samsung device.`,
      features: JSON.stringify([
        'All Samsung Galaxy models',
        'Knox removal & reset',
        'Warranty void reset',
        '48-72 hour delivery',
        'Full customization',
        'Expert support'
      ]),
      requirements: JSON.stringify([
        'Samsung model name',
        'Android version',
        'Knox status',
        'Device IMEI'
      ]),
      deliverables: JSON.stringify([
        'Knox removed successfully',
        'Customization guide',
        'Root/ROM installation support',
        'Safety warnings'
      ]),
      base_price: 59.99,
      sale_price: 54.99,
      currency: 'USD',
      duration: '3-4 days',
      delivery_time: '48-72 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: true,
      is_customizable: false,
      service_type: 'premium',
      tags: JSON.stringify(['samsung', 'knox', 'removal', 'customization', 'root']),
      meta_title: 'Samsung Knox Removal Service',
      meta_description: 'Professional Samsung Knox removal service. Remove Knox security to enable full device customization.',
      status: 'active',
      sort_order: 20
    },
    {
      service_name: 'iPhone Screen Repair Service',
      slug: 'iphone-screen-repair',
      short_description: 'Professional iPhone screen repair service. Fix cracked or damaged screens on all iPhone models.',
      description: `Repair your iPhone screen professionally. We support all iPhone models from iPhone 6 to iPhone 15 Pro Max. Includes screen replacement, digitizer repair, and calibration.

Features:
• All iPhone models (6 to 15 Pro Max)
• Original quality screens
• Professional installation
• Touch calibration included
• Fast 24-48 hour service
• Warranty on repair

Perfect for cracked, broken, or unresponsive iPhone screens.`,
      features: JSON.stringify([
        'All iPhone models',
        'Original quality screens',
        'Professional installation',
        'Touch calibration',
        '24-48 hour service',
        'Repair warranty'
      ]),
      requirements: JSON.stringify([
        'iPhone model',
        'Screen damage description',
        'Device condition',
        'Shipping address (if remote)'
      ]),
      deliverables: JSON.stringify([
        'Screen repaired/replaced',
        'Device tested and calibrated',
        'Repair warranty certificate',
        'Care instructions'
      ]),
      base_price: 89.99,
      sale_price: 79.99,
      currency: 'USD',
      duration: '2-3 days',
      delivery_time: '24-48 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: false,
      requires_consultation: true,
      is_customizable: false,
      service_type: 'premium',
      tags: JSON.stringify(['iphone', 'screen-repair', 'display', 'cracked-screen', 'repair']),
      meta_title: 'iPhone Screen Repair Service - Professional',
      meta_description: 'Professional iPhone screen repair service. Fix cracked or damaged screens on all iPhone models with original quality parts.',
      status: 'active',
      sort_order: 21
    },
    {
      service_name: 'Battery Replacement Service',
      slug: 'battery-replacement-service',
      short_description: 'Replace your mobile device battery. Restore battery life and performance on all devices.',
      description: `Replace your mobile device battery to restore battery life and performance. We support all major brands including iPhone, Samsung, Xiaomi, OnePlus, and more.

Features:
• All major device brands
• Original quality batteries
• Professional installation
• Battery health calibration
• Fast 24-48 hour service
• Warranty on replacement

Perfect when your device battery is draining quickly or not holding a charge.`,
      features: JSON.stringify([
        'All major brands',
        'Original quality batteries',
        'Professional installation',
        'Battery calibration',
        '24-48 hour service',
        'Replacement warranty'
      ]),
      requirements: JSON.stringify([
        'Device brand and model',
        'Battery health status',
        'Device condition',
        'Shipping address (if remote)'
      ]),
      deliverables: JSON.stringify([
        'Battery replaced',
        'Battery health calibrated',
        'Performance optimized',
        'Replacement warranty'
      ]),
      base_price: 49.99,
      sale_price: 44.99,
      currency: 'USD',
      duration: '2-3 days',
      delivery_time: '24-48 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: false,
      requires_consultation: true,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['battery', 'replacement', 'repair', 'mobile', 'all-brands']),
      meta_title: 'Battery Replacement Service - All Devices',
      meta_description: 'Professional battery replacement service. Replace batteries on all mobile devices with original quality parts.',
      status: 'active',
      sort_order: 22
    },
    {
      service_name: 'Water Damage Repair',
      slug: 'water-damage-repair',
      short_description: 'Repair water-damaged mobile devices. Professional cleaning and component replacement.',
      description: `Repair your water-damaged mobile device with our professional service. Includes thorough cleaning, component inspection, and replacement of damaged parts.

Features:
• All mobile device brands
• Professional cleaning process
• Component inspection
• Damaged part replacement
• Fast 48-72 hour service
• Data recovery included (if possible)

Perfect when your device has been exposed to water or other liquids.`,
      features: JSON.stringify([
        'All device brands',
        'Professional cleaning',
        'Component inspection',
        'Part replacement',
        '48-72 hour service',
        'Data recovery attempt'
      ]),
      requirements: JSON.stringify([
        'Device brand and model',
        'Water exposure details',
        'Device condition',
        'Shipping address (if remote)'
      ]),
      deliverables: JSON.stringify([
        'Device cleaned and repaired',
        'Damaged parts replaced',
        'Device tested and verified',
        'Repair warranty',
        'Data recovery report (if applicable)'
      ]),
      base_price: 79.99,
      sale_price: 69.99,
      currency: 'USD',
      duration: '3-5 days',
      delivery_time: '48-72 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: false,
      requires_consultation: true,
      is_customizable: false,
      service_type: 'premium',
      tags: JSON.stringify(['water-damage', 'repair', 'cleaning', 'mobile', 'all-brands']),
      meta_title: 'Water Damage Repair Service - Professional',
      meta_description: 'Professional water damage repair service. Clean and repair water-damaged mobile devices with component replacement.',
      status: 'active',
      sort_order: 23
    },
    {
      service_name: 'Software Update Service',
      slug: 'software-update-service',
      short_description: 'Update your device software to the latest version. Official and custom updates available.',
      description: `Update your mobile device to the latest software version. We provide official updates and custom ROM updates for devices that no longer receive official support.

Features:
• Official software updates
• Custom ROM updates
• All Android and iOS devices
• Fast 24-48 hour delivery
• Data backup included
• Rollback support if needed

Perfect when your device is stuck on an old version or no longer receives official updates.`,
      features: JSON.stringify([
        'Official & custom updates',
        'All Android & iOS devices',
        '24-48 hour delivery',
        'Data backup included',
        'Rollback support',
        'Expert guidance'
      ]),
      requirements: JSON.stringify([
        'Device brand and model',
        'Current software version',
        'Desired update version',
        'Device condition'
      ]),
      deliverables: JSON.stringify([
        'Software updated',
        'Update verification',
        'Data backup files',
        'Update guide',
        'Rollback instructions (if needed)'
      ]),
      base_price: 34.99,
      sale_price: 29.99,
      currency: 'USD',
      duration: '2-3 days',
      delivery_time: '24-48 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: false,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'standard',
      tags: JSON.stringify(['software-update', 'android', 'ios', 'custom-rom', 'update']),
      meta_title: 'Software Update Service - Latest Versions',
      meta_description: 'Professional software update service. Update your mobile device to the latest software version with data backup.',
      status: 'active',
      sort_order: 24
    },
    {
      service_name: 'IMEI Repair Service',
      slug: 'imei-repair-service',
      short_description: 'Repair corrupted or lost IMEI on your device. Restore device functionality and network access.',
      description: `Repair corrupted or lost IMEI on your mobile device to restore network access and device functionality. Works on all Android devices.

Features:
• All Android devices
• IMEI repair and restoration
• Network access restoration
• Fast 24-48 hour delivery
• Permanent fix
• Device verification included

Perfect when your device shows "Invalid IMEI" or has lost network connectivity.`,
      features: JSON.stringify([
        'All Android devices',
        'IMEI repair & restoration',
        'Network access restored',
        '24-48 hour delivery',
        'Permanent fix',
        'Device verification'
      ]),
      requirements: JSON.stringify([
        'Device brand and model',
        'Android version',
        'IMEI status',
        'Device condition'
      ]),
      deliverables: JSON.stringify([
        'IMEI repaired and restored',
        'Network access verified',
        'Device functionality confirmed',
        'Repair warranty'
      ]),
      base_price: 44.99,
      sale_price: 39.99,
      currency: 'USD',
      duration: '2-3 days',
      delivery_time: '24-48 hours',
      min_quantity: 1,
      max_quantity: null,
      is_active: true,
      is_featured: true,
      is_digital: true,
      requires_consultation: false,
      is_customizable: false,
      service_type: 'premium',
      tags: JSON.stringify(['imei', 'repair', 'network', 'android', 'restoration']),
      meta_title: 'IMEI Repair Service - Restore Network Access',
      meta_description: 'Professional IMEI repair service. Repair corrupted or lost IMEI on Android devices to restore network access.',
      status: 'active',
      sort_order: 25
    }
  ];

  // Insert services
  for (const service of mobileServices) {
    await knex('res_services').insert(service);
  }

  console.log(`✅ Inserted ${mobileServices.length} mobile services`);
};

