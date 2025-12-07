/**
 * Seed: Digital Products
 * Description: Seed real digital products (software, apps, digital downloads)
 */

const { faker } = require('@faker-js/faker');

const digitalProducts = [
  {
    product_name: 'Adobe Photoshop 2024 - Full License',
    slug: 'adobe-photoshop-2024-full-license',
    sku: 'ADB-PS-2024',
    short_description: 'Professional photo editing software with advanced AI features. Full lifetime license with all updates.',
    description: `Adobe Photoshop 2024 is the industry-standard photo editing software trusted by millions of professionals worldwide. This full license includes:

• Lifetime access to Photoshop 2024
• All future updates and patches
• Advanced AI-powered editing tools
• Cloud storage integration
• Premium support and tutorials
• Works on Windows and macOS
• No subscription required - one-time purchase

Perfect for photographers, graphic designers, and digital artists who need professional-grade editing capabilities.`,
    original_price: 599.99,
    sale_price: 449.99,
    stock_quantity: 0, // Unlimited for digital (0 = unlimited)
    manufacturer: 'Adobe Inc.',
    supplier: 'Adobe Official',
    product_type: 'digital',
    status: 2, // Active
    is_featured: 1,
    rating: 4.8,
    reviews_count: 1250,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2, // Instant Delivery
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 5,
    download_expiry_days: 365,
    delivery_instructions: 'After purchase, you will receive an activation key via email within 5 minutes. Download links and installation instructions will be provided.',
    min_cart_qty: 1,
    max_cart_qty: 1
  },
  {
    product_name: 'Microsoft Office 2024 Professional Plus',
    slug: 'microsoft-office-2024-professional-plus',
    sku: 'MS-OFF-2024-PRO',
    short_description: 'Complete Microsoft Office suite with Word, Excel, PowerPoint, Outlook, and more. Lifetime license.',
    description: `Microsoft Office 2024 Professional Plus includes all essential productivity tools:

• Microsoft Word 2024
• Microsoft Excel 2024
• Microsoft PowerPoint 2024
• Microsoft Outlook 2024
• Microsoft Access 2024
• Microsoft Publisher 2024
• Microsoft OneNote 2024
• Lifetime license (no subscription)
• Works on Windows 10/11
• All future updates included

Ideal for businesses, students, and professionals who need comprehensive office productivity software.`,
    original_price: 399.99,
    sale_price: 299.99,
    stock_quantity: 0,
    manufacturer: 'Microsoft Corporation',
    supplier: 'Microsoft Official',
    product_type: 'digital',
    status: 2,
    is_featured: 1,
    rating: 4.7,
    reviews_count: 890,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 3,
    download_expiry_days: 365,
    delivery_instructions: 'Product key will be emailed within 10 minutes. Download links for Office installer will be provided. Installation guide included.',
    min_cart_qty: 1,
    max_cart_qty: 1
  },
  {
    product_name: 'Windows 11 Pro - Digital License Key',
    slug: 'windows-11-pro-digital-license-key',
    sku: 'WIN11-PRO-KEY',
    short_description: 'Genuine Windows 11 Pro license key. Instant delivery via email. Works worldwide.',
    description: `Upgrade to Windows 11 Pro with this genuine digital license key:

• Full Windows 11 Pro license
• Lifetime activation
• All Pro features unlocked
• Works on new installations and upgrades
• Genuine Microsoft key
• Instant email delivery
• No physical shipment needed
• Worldwide activation support

Perfect for new PC builds, upgrades from Windows 10, or reinstalling Windows 11 Pro.`,
    original_price: 199.99,
    sale_price: 149.99,
    stock_quantity: 0,
    manufacturer: 'Microsoft Corporation',
    supplier: 'Microsoft Official',
    product_type: 'digital',
    status: 2,
    is_featured: 1,
    rating: 4.9,
    reviews_count: 2340,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 1,
    download_expiry_days: 365,
    delivery_instructions: 'License key will be emailed immediately after purchase. You can activate Windows 11 Pro using this key during installation or upgrade.',
    min_cart_qty: 1,
    max_cart_qty: 5
  },
  {
    product_name: 'Norton 360 Deluxe - 1 Year Subscription',
    slug: 'norton-360-deluxe-1-year',
    sku: 'NORT-360-DEL-1YR',
    short_description: 'Complete antivirus and internet security suite. Protects up to 5 devices for 1 year.',
    description: `Norton 360 Deluxe provides comprehensive protection for your digital life:

• Real-time threat protection
• Secure VPN (Virtual Private Network)
• Password manager
• Dark web monitoring
• Parental controls
• Cloud backup (50GB)
• Protects up to 5 devices
• 1-year subscription
• 24/7 customer support

Essential security software for families and individuals who want complete protection against viruses, malware, and online threats.`,
    original_price: 99.99,
    sale_price: 79.99,
    stock_quantity: 0,
    manufacturer: 'NortonLifeLock',
    supplier: 'Norton Official',
    product_type: 'digital',
    status: 2,
    is_featured: 0,
    rating: 4.6,
    reviews_count: 567,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 10,
    download_expiry_days: 365,
    delivery_instructions: 'Subscription key and download link will be emailed within 5 minutes. Create a Norton account to activate and manage your subscription.',
    min_cart_qty: 1,
    max_cart_qty: 3
  },
  {
    product_name: 'Final Cut Pro X - macOS Video Editing',
    slug: 'final-cut-pro-x-macos',
    sku: 'APP-FCP-X',
    short_description: 'Professional video editing software for macOS. Industry-leading tools for filmmakers and content creators.',
    description: `Final Cut Pro X is Apple's professional video editing software:

• Advanced video editing tools
• 360° video editing support
• HDR color grading
• Motion graphics templates
• Audio editing and mixing
• 4K and 8K video support
• Optimized for Apple Silicon
• Lifetime license
• Regular free updates

Perfect for professional video editors, YouTubers, and filmmakers working on macOS.`,
    original_price: 299.99,
    sale_price: 249.99,
    stock_quantity: 0,
    manufacturer: 'Apple Inc.',
    supplier: 'Apple Official',
    product_type: 'digital',
    status: 2,
    is_featured: 1,
    rating: 4.8,
    reviews_count: 1120,
    is_digital_download: true,
    requires_activation_key: false,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 3,
    download_expiry_days: 180,
    delivery_instructions: 'Download link will be provided via email. Requires macOS 12.0 or later. Install from the provided DMG file.',
    min_cart_qty: 1,
    max_cart_qty: 1
  },
  {
    product_name: 'AutoCAD 2024 - Professional License',
    slug: 'autocad-2024-professional-license',
    sku: 'AUT-CAD-2024',
    short_description: 'Professional CAD software for architects, engineers, and designers. Full version with lifetime license.',
    description: `AutoCAD 2024 is the leading CAD software for professionals:

• 2D and 3D design tools
• Industry-standard CAD features
• Cloud collaboration
• Mobile app access
• Customizable workspace
• Advanced rendering
• Lifetime license
• All updates included
• Professional support

Essential for architects, engineers, interior designers, and construction professionals.`,
    original_price: 1690.00,
    sale_price: 1299.99,
    stock_quantity: 0,
    manufacturer: 'Autodesk Inc.',
    supplier: 'Autodesk Official',
    product_type: 'digital',
    status: 2,
    is_featured: 1,
    rating: 4.7,
    reviews_count: 450,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 5,
    download_expiry_days: 365,
    delivery_instructions: 'Activation key and download link will be emailed within 15 minutes. Supports Windows and macOS. Installation guide included.',
    min_cart_qty: 1,
    max_cart_qty: 1
  },
  {
    product_name: 'Adobe Premiere Pro 2024 - Video Editor',
    slug: 'adobe-premiere-pro-2024',
    sku: 'ADB-PR-2024',
    short_description: 'Professional video editing software with AI-powered features. Full license with lifetime updates.',
    description: `Adobe Premiere Pro 2024 is the industry-standard video editing software:

• Professional video editing
• AI-powered auto-reframe
• Advanced color grading
• Audio mixing and effects
• Motion graphics integration
• 4K and 8K support
• Cloud collaboration
• Lifetime license
• Regular updates

Perfect for video editors, filmmakers, and content creators who need professional-grade editing tools.`,
    original_price: 599.99,
    sale_price: 449.99,
    stock_quantity: 0,
    manufacturer: 'Adobe Inc.',
    supplier: 'Adobe Official',
    product_type: 'digital',
    status: 2,
    is_featured: 1,
    rating: 4.8,
    reviews_count: 980,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 5,
    download_expiry_days: 365,
    delivery_instructions: 'Activation key will be emailed within 5 minutes. Download links and installation instructions provided. Works on Windows and macOS.',
    min_cart_qty: 1,
    max_cart_qty: 1
  },
  {
    product_name: 'QuickBooks Desktop Pro 2024',
    slug: 'quickbooks-desktop-pro-2024',
    sku: 'QB-PRO-2024',
    short_description: 'Complete accounting software for small businesses. Track income, expenses, and manage finances.',
    description: `QuickBooks Desktop Pro 2024 helps you manage your business finances:

• Income and expense tracking
• Invoice creation and management
• Bill payment tracking
• Financial reporting
• Tax preparation tools
• Bank reconciliation
• Inventory management
• Payroll integration (optional)
• Lifetime license

Ideal for small businesses, freelancers, and entrepreneurs who need comprehensive accounting software.`,
    original_price: 299.99,
    sale_price: 229.99,
    stock_quantity: 0,
    manufacturer: 'Intuit Inc.',
    supplier: 'Intuit Official',
    product_type: 'digital',
    status: 2,
    is_featured: 0,
    rating: 4.5,
    reviews_count: 670,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 3,
    download_expiry_days: 365,
    delivery_instructions: 'Product key and download link will be emailed within 10 minutes. Supports Windows only. Installation guide included.',
    min_cart_qty: 1,
    max_cart_qty: 1
  },
  {
    product_name: 'VMware Workstation Pro 17',
    slug: 'vmware-workstation-pro-17',
    sku: 'VMW-WS-PRO-17',
    short_description: 'Professional virtualization software. Run multiple operating systems on a single PC.',
    description: `VMware Workstation Pro 17 enables powerful virtualization:

• Run multiple OS simultaneously
• Create and test virtual machines
• Snapshots and cloning
• Network simulation
• USB device support
• 4K display support
• vSphere integration
• Lifetime license
• Regular updates

Perfect for developers, IT professionals, and system administrators who need to test software across different operating systems.`,
    original_price: 199.99,
    sale_price: 149.99,
    stock_quantity: 0,
    manufacturer: 'VMware Inc.',
    supplier: 'VMware Official',
    product_type: 'digital',
    status: 2,
    is_featured: 0,
    rating: 4.7,
    reviews_count: 320,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 5,
    download_expiry_days: 365,
    delivery_instructions: 'License key and download link will be emailed within 5 minutes. Supports Windows and Linux. Installation guide provided.',
    min_cart_qty: 1,
    max_cart_qty: 1
  },
  {
    product_name: 'Adobe Illustrator 2024 - Vector Graphics',
    slug: 'adobe-illustrator-2024',
    sku: 'ADB-AI-2024',
    short_description: 'Professional vector graphics design software. Create logos, illustrations, and vector art.',
    description: `Adobe Illustrator 2024 is the industry-standard vector graphics software:

• Professional vector design tools
• AI-powered features
• Advanced typography
• 3D effects and rendering
• Pattern creation tools
• Cloud integration
• Lifetime license
• All updates included
• Premium support

Perfect for graphic designers, illustrators, and artists who create logos, icons, and vector illustrations.`,
    original_price: 599.99,
    sale_price: 449.99,
    stock_quantity: 0,
    manufacturer: 'Adobe Inc.',
    supplier: 'Adobe Official',
    product_type: 'digital',
    status: 2,
    is_featured: 1,
    rating: 4.8,
    reviews_count: 890,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 5,
    download_expiry_days: 365,
    delivery_instructions: 'Activation key will be emailed within 5 minutes. Download links and installation instructions provided. Works on Windows and macOS.',
    min_cart_qty: 1,
    max_cart_qty: 1
  },
  {
    product_name: 'Windows 10 Pro - Digital License Key',
    slug: 'windows-10-pro-digital-license',
    sku: 'WIN10-PRO-KEY',
    short_description: 'Genuine Windows 10 Pro license key. Instant email delivery. Lifetime activation.',
    description: `Upgrade to Windows 10 Pro with this genuine digital license:

• Full Windows 10 Pro license
• Lifetime activation
• All Pro features unlocked
• Works on upgrades and clean installs
• Genuine Microsoft key
• Instant delivery
• Worldwide activation
• No physical shipment

Perfect for upgrading from Windows 10 Home or installing Windows 10 Pro on a new PC.`,
    original_price: 179.99,
    sale_price: 129.99,
    stock_quantity: 0,
    manufacturer: 'Microsoft Corporation',
    supplier: 'Microsoft Official',
    product_type: 'digital',
    status: 2,
    is_featured: 0,
    rating: 4.8,
    reviews_count: 1890,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 1,
    download_expiry_days: 365,
    delivery_instructions: 'License key will be emailed immediately after purchase. Use this key to activate Windows 10 Pro during installation or upgrade.',
    min_cart_qty: 1,
    max_cart_qty: 5
  },
  {
    product_name: 'CorelDRAW Graphics Suite 2024',
    slug: 'coreldraw-graphics-suite-2024',
    sku: 'COR-DRAW-2024',
    short_description: 'Complete graphics design suite. Vector illustration, photo editing, and layout tools in one package.',
    description: `CorelDRAW Graphics Suite 2024 is a complete design solution:

• CorelDRAW - Vector illustration
• Corel PHOTO-PAINT - Photo editing
• Corel Font Manager
• AfterShot HDR - Photo enhancement
• CAPTURE - Screen capture tool
• Lifetime license
• Regular updates
• Professional support

Perfect for graphic designers, marketers, and creative professionals who need comprehensive design tools.`,
    original_price: 499.99,
    sale_price: 379.99,
    stock_quantity: 0,
    manufacturer: 'Corel Corporation',
    supplier: 'Corel Official',
    product_type: 'digital',
    status: 2,
    is_featured: 0,
    rating: 4.6,
    reviews_count: 420,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 3,
    download_expiry_days: 365,
    delivery_instructions: 'Product key and download link will be emailed within 10 minutes. Supports Windows only. Installation guide included.',
    min_cart_qty: 1,
    max_cart_qty: 1
  },
  {
    product_name: 'Kaspersky Total Security - 1 Year',
    slug: 'kaspersky-total-security-1-year',
    sku: 'KAS-TS-1YR',
    short_description: 'Complete internet security suite. Protects up to 5 devices for 1 year with advanced threat protection.',
    description: `Kaspersky Total Security provides comprehensive protection:

• Advanced antivirus protection
• Real-time threat detection
• Safe Money for online banking
• Password manager
• VPN (Virtual Private Network)
• Parental controls
• File encryption
• Protects up to 5 devices
• 1-year subscription

Essential security software for families and businesses who want complete protection against cyber threats.`,
    original_price: 89.99,
    sale_price: 69.99,
    stock_quantity: 0,
    manufacturer: 'Kaspersky Lab',
    supplier: 'Kaspersky Official',
    product_type: 'digital',
    status: 2,
    is_featured: 0,
    rating: 4.7,
    reviews_count: 780,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 10,
    download_expiry_days: 365,
    delivery_instructions: 'Activation key and download link will be emailed within 5 minutes. Create a Kaspersky account to activate and manage your subscription.',
    min_cart_qty: 1,
    max_cart_qty: 3
  },
  {
    product_name: 'Logic Pro X - Professional Music Production',
    slug: 'logic-pro-x-macos',
    sku: 'APP-LOGIC-PRO-X',
    short_description: 'Professional music production software for macOS. Industry-standard DAW for musicians and producers.',
    description: `Logic Pro X is Apple's professional music production software:

• Professional recording studio
• Virtual instruments library
• Advanced MIDI editing
• Audio mixing and mastering
• Apple Loops library
• Flex Time and Flex Pitch
• 3D surround sound mixing
• Lifetime license
• Regular updates

Perfect for musicians, producers, and audio engineers working on macOS who need professional music production tools.`,
    original_price: 199.99,
    sale_price: 179.99,
    stock_quantity: 0,
    manufacturer: 'Apple Inc.',
    supplier: 'Apple Official',
    product_type: 'digital',
    status: 2,
    is_featured: 1,
    rating: 4.9,
    reviews_count: 650,
    is_digital_download: true,
    requires_activation_key: false,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 3,
    download_expiry_days: 180,
    delivery_instructions: 'Download link will be provided via email. Requires macOS 12.0 or later. Install from the Mac App Store using the provided link.',
    min_cart_qty: 1,
    max_cart_qty: 1
  },
  {
    product_name: 'SolidWorks 2024 - Professional CAD',
    slug: 'solidworks-2024-professional-cad',
    sku: 'SW-2024-PRO',
    short_description: 'Professional 3D CAD software for mechanical design and engineering. Full version with lifetime license.',
    description: `SolidWorks 2024 is the leading 3D CAD software for mechanical design:

• 3D solid modeling
• Assembly design
• Engineering drawings
• Simulation and analysis
• Sheet metal design
• Weldments
• Surface modeling
• Lifetime license
• Professional support

Essential for mechanical engineers, product designers, and manufacturers who need professional 3D CAD capabilities.`,
    original_price: 3995.00,
    sale_price: 3499.99,
    stock_quantity: 0,
    manufacturer: 'Dassault Systèmes',
    supplier: 'SolidWorks Official',
    product_type: 'digital',
    status: 2,
    is_featured: 1,
    rating: 4.8,
    reviews_count: 280,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 5,
    download_expiry_days: 365,
    delivery_instructions: 'License key and download link will be emailed within 24 hours. Supports Windows only. Installation and activation guide included.',
    min_cart_qty: 1,
    max_cart_qty: 1
  },
  {
    product_name: 'Adobe After Effects 2024',
    slug: 'adobe-after-effects-2024',
    sku: 'ADB-AE-2024',
    short_description: 'Professional motion graphics and visual effects software. Create stunning animations and VFX.',
    description: `Adobe After Effects 2024 is the industry-standard motion graphics software:

• Professional motion graphics
• Visual effects compositing
• 3D animation tools
• Advanced keying and tracking
• Expression-based animation
• Integration with other Adobe apps
• Lifetime license
• Regular updates

Perfect for motion graphics artists, VFX professionals, and video editors who create animated content and visual effects.`,
    original_price: 599.99,
    sale_price: 449.99,
    stock_quantity: 0,
    manufacturer: 'Adobe Inc.',
    supplier: 'Adobe Official',
    product_type: 'digital',
    status: 2,
    is_featured: 1,
    rating: 4.8,
    reviews_count: 720,
    is_digital_download: true,
    requires_activation_key: true,
    delivery_method: 2,
    requires_shipping_address: false,
    track_inventory: false,
    download_limit: 5,
    download_expiry_days: 365,
    delivery_instructions: 'Activation key will be emailed within 5 minutes. Download links and installation instructions provided. Works on Windows and macOS.',
    min_cart_qty: 1,
    max_cart_qty: 1
  }
];

exports.seed = async function(knex) {
  console.log('🌱 Starting to seed digital products...');
  
  // Delete existing digital products to allow reseeding
  const deleted = await knex('res_products')
    .where('product_type', 'digital')
    .del();
  
  if (deleted > 0) {
    console.log(`🗑️  Deleted ${deleted} existing digital products for clean reseed.`);
  }
  
  // Insert digital products
  console.log('📦 Inserting digital products...');
  
  for (const product of digitalProducts) {
    const [productId] = await knex('res_products').insert({
      product_name: product.product_name,
      slug: product.slug,
      sku: product.sku,
      short_description: product.short_description,
      description: product.description,
      original_price: product.original_price,
      sale_price: product.sale_price,
      stock_quantity: product.stock_quantity,
      manufacturer: product.manufacturer,
      supplier: product.supplier,
      product_type: product.product_type,
      status: product.status,
      is_featured: product.is_featured,
      rating: product.rating,
      reviews_count: product.reviews_count,
      is_digital_download: product.is_digital_download,
      requires_activation_key: product.requires_activation_key,
      delivery_method: product.delivery_method,
      requires_shipping_address: product.requires_shipping_address,
      track_inventory: product.track_inventory,
      download_limit: product.download_limit,
      download_expiry_days: product.download_expiry_days,
      delivery_instructions: product.delivery_instructions,
      min_cart_qty: product.min_cart_qty,
      max_cart_qty: product.max_cart_qty,
      created_at: faker.date.past({ years: 1 }),
      updated_at: faker.date.recent({ days: 30 })
    });
    
    console.log(`  ✅ Created: ${product.product_name} - $${product.sale_price}`);
  }
  
  console.log('🎉 Successfully seeded digital products!');
  
  // Display statistics
  const totalDigital = await knex('res_products')
    .where('product_type', 'digital')
    .count('* as count')
    .first();
  
  const featuredDigital = await knex('res_products')
    .where('product_type', 'digital')
    .where('is_featured', 1)
    .count('* as count')
    .first();
  
  const priceStats = await knex('res_products')
    .where('product_type', 'digital')
    .select(
      knex.raw('MIN(sale_price) as min_price'),
      knex.raw('MAX(sale_price) as max_price'),
      knex.raw('AVG(sale_price) as avg_price')
    )
    .first();
  
  console.log('\n📊 Digital Products Statistics:');
  console.log(`   Total Products: ${totalDigital.count}`);
  console.log(`   Featured Products: ${featuredDigital.count}`);
  console.log(`   Price Range: $${Number(priceStats.min_price).toFixed(2)} - $${Number(priceStats.max_price).toFixed(2)}`);
  console.log(`   Average Price: $${Number(priceStats.avg_price).toFixed(2)}`);
};

