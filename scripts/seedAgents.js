const { pool } = require('../config/database');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: 'YOUR_OPENAI_API_KEY_HERE'
});

// Realistic agents data (20 agents - mix of resellers and distributors)
const agents = [
  {
    name: "TechMobile Solutions",
    email: "contact@techmobilesolutions.com",
    phone: "+1-555-1001",
    whatsapp: "+1-555-1001",
    address: "123 Business Park, New York, NY 10001",
    country_code: "US",
    website: "https://techmobilesolutions.com",
    telegram: "https://t.me/techmobilesolutions",
    description: "Leading mobile device reseller specializing in firmware solutions and device repair services.",
    agent_type: "reseller",
    position: 1,
    status: 1,
    logo_prompt: "Modern tech company logo for TechMobile Solutions, minimalist design, blue and white colors, professional, tech industry, square format"
  },
  {
    name: "Global Device Distributors",
    email: "sales@globaldevicedist.com",
    phone: "+44-20-7001",
    whatsapp: "+44-20-7001",
    address: "456 Commerce Street, London, UK EC1A 1BB",
    country_code: "GB",
    website: "https://globaldevicedist.com",
    telegram: "https://t.me/globaldevicedist",
    description: "International distributor of mobile devices and firmware tools. Serving markets across Europe and Asia.",
    agent_type: "distributor",
    position: 2,
    status: 1,
    logo_prompt: "Professional distribution company logo for Global Device Distributors, corporate style, dark blue and gold, global network theme, square format"
  },
  {
    name: "MobileFix Pro",
    email: "info@mobilefixpro.com",
    phone: "+1-555-1002",
    whatsapp: "+1-555-1002",
    address: "789 Tech Avenue, San Francisco, CA 94102",
    country_code: "US",
    website: "https://mobilefixpro.com",
    telegram: null,
    description: "Professional mobile device repair and firmware services. Expert technicians with years of experience.",
    agent_type: "reseller",
    position: 3,
    status: 1,
    logo_prompt: "Tech repair company logo for MobileFix Pro, modern design, green and white, tool and mobile device icon, square format"
  },
  {
    name: "Asia Pacific Mobile Distributors",
    email: "contact@apmobiledist.com",
    phone: "+65-6123-4567",
    whatsapp: "+65-6123-4567",
    address: "321 Orchard Road, Singapore 238801",
    country_code: "SG",
    website: "https://apmobiledist.com",
    telegram: "https://t.me/apmobiledist",
    description: "Premier distributor of mobile devices and accessories across Asia Pacific region. Established 2010.",
    agent_type: "distributor",
    position: 4,
    status: 1,
    logo_prompt: "Asian distribution company logo for Asia Pacific Mobile Distributors, modern Asian design, red and white, professional, square format"
  },
  {
    name: "Firmware Experts Inc",
    email: "sales@firmwareexperts.com",
    phone: "+1-555-1003",
    whatsapp: "+1-555-1003",
    address: "654 Software Boulevard, Austin, TX 78701",
    country_code: "US",
    website: "https://firmwareexperts.com",
    telegram: "https://t.me/firmwareexperts",
    description: "Specialized firmware development and distribution services. Custom solutions for businesses.",
    agent_type: "reseller",
    position: 5,
    status: 1,
    logo_prompt: "Tech company logo for Firmware Experts Inc, technical design, purple and white, circuit board theme, square format"
  },
  {
    name: "European Mobile Network",
    email: "info@eumobilenetwork.com",
    phone: "+49-30-123456",
    whatsapp: "+49-30-123456",
    address: "987 Innovation Center, Berlin, Germany 10115",
    country_code: "DE",
    website: "https://eumobilenetwork.com",
    telegram: "https://t.me/eumobilenetwork",
    description: "Leading European distributor of mobile devices and firmware solutions. Serving 15+ countries.",
    agent_type: "distributor",
    position: 6,
    status: 1,
    logo_prompt: "European company logo for European Mobile Network, sophisticated design, blue and yellow, network nodes theme, square format"
  },
  {
    name: "Device Solutions Co",
    email: "contact@devicesolutions.com",
    phone: "+1-555-1004",
    whatsapp: "+1-555-1004",
    address: "147 Tech Plaza, Seattle, WA 98101",
    country_code: "US",
    website: "https://devicesolutions.com",
    telegram: null,
    description: "Comprehensive mobile device solutions provider. Reseller of premium devices and firmware tools.",
    agent_type: "reseller",
    position: 7,
    status: 1,
    logo_prompt: "Modern company logo for Device Solutions Co, clean design, orange and blue, device icon, square format"
  },
  {
    name: "Middle East Mobile Distributors",
    email: "sales@memobiledist.com",
    phone: "+971-4-123-4567",
    whatsapp: "+971-4-123-4567",
    address: "258 Business Bay, Dubai, UAE",
    country_code: "AE",
    website: "https://memobiledist.com",
    telegram: "https://t.me/memobiledist",
    description: "Premier distributor serving Middle East and North Africa. Extensive network of authorized dealers.",
    agent_type: "distributor",
    position: 8,
    status: 1,
    logo_prompt: "Middle Eastern company logo for Middle East Mobile Distributors, elegant design, gold and green, Arabic influence, square format"
  },
  {
    name: "SmartPhone Resellers",
    email: "info@smartphoneresellers.com",
    phone: "+1-555-1005",
    whatsapp: "+1-555-1005",
    address: "369 Mobile Street, Los Angeles, CA 90001",
    country_code: "US",
    website: "https://smartphoneresellers.com",
    telegram: "https://t.me/smartphoneresellers",
    description: "Authorized reseller of smartphones and mobile accessories. Competitive pricing and excellent service.",
    agent_type: "reseller",
    position: 9,
    status: 1,
    logo_prompt: "Retail company logo for SmartPhone Resellers, friendly design, bright colors, smartphone icon, square format"
  },
  {
    name: "India Mobile Distributors",
    email: "contact@indiamobiledist.com",
    phone: "+91-11-2345",
    whatsapp: "+91-11-2345-6789",
    address: "741 Tech Park, Bangalore, Karnataka 560001",
    country_code: "IN",
    website: "https://indiamobiledist.com",
    telegram: "https://t.me/indiamobiledist",
    description: "Leading distributor of mobile devices across India. Serving retail and enterprise customers nationwide.",
    agent_type: "distributor",
    position: 10,
    status: 1,
    logo_prompt: "Indian company logo for India Mobile Distributors, vibrant design, saffron and blue, modern Indian style, square format"
  },
  {
    name: "Firmware Solutions Hub",
    email: "sales@firmwaresolutionshub.com",
    phone: "+1-555-1006",
    whatsapp: "+1-555-1006",
    address: "852 Tech Drive, Boston, MA 02101",
    country_code: "US",
    website: "https://firmwaresolutionshub.com",
    telegram: null,
    description: "Specialized firmware reseller offering custom solutions and technical support for businesses.",
    agent_type: "reseller",
    position: 11,
    status: 1,
    logo_prompt: "Tech hub logo for Firmware Solutions Hub, modern tech design, cyan and dark blue, hub network theme, square format"
  },
  {
    name: "Latin America Mobile Network",
    email: "info@lamobilenetwork.com",
    phone: "+55-11-3456",
    whatsapp: "+55-11-3456-7890",
    address: "963 Business Center, São Paulo, Brazil 01310-100",
    country_code: "BR",
    website: "https://lamobilenetwork.com",
    telegram: "https://t.me/lamobilenetwork",
    description: "Major distributor serving Latin American markets. Strong presence in Brazil, Mexico, and Argentina.",
    agent_type: "distributor",
    position: 12,
    status: 1,
    logo_prompt: "Latin American company logo for Latin America Mobile Network, vibrant design, green and yellow, network theme, square format"
  },
  {
    name: "Premium Device Resellers",
    email: "contact@premiumdeviceresellers.com",
    phone: "+1-555-1007",
    whatsapp: "+1-555-1007",
    address: "159 Luxury Plaza, Miami, FL 33101",
    country_code: "US",
    website: "https://premiumdeviceresellers.com",
    telegram: "https://t.me/premiumdeviceresellers",
    description: "Premium mobile device reseller specializing in high-end smartphones and exclusive firmware access.",
    agent_type: "reseller",
    position: 13,
    status: 1,
    logo_prompt: "Premium brand logo for Premium Device Resellers, luxury design, gold and black, elegant style, square format"
  },
  {
    name: "Africa Mobile Distributors",
    email: "sales@africamobiledist.com",
    phone: "+27-11-234-5678",
    whatsapp: "+27-11-234-5678",
    address: "357 Commerce Square, Johannesburg, South Africa 2001",
    country_code: "ZA",
    website: "https://africamobiledist.com",
    telegram: "https://t.me/africamobiledist",
    description: "Leading mobile device distributor across Africa. Serving 20+ countries with reliable distribution network.",
    agent_type: "distributor",
    position: 14,
    status: 1,
    logo_prompt: "African company logo for Africa Mobile Distributors, bold design, green and yellow, African continent theme, square format"
  },
  {
    name: "Tech Reseller Pro",
    email: "info@techresellerpro.com",
    phone: "+1-555-1008",
    whatsapp: "+1-555-1008",
    address: "741 Innovation Way, Chicago, IL 60601",
    country_code: "US",
    website: "https://techresellerpro.com",
    telegram: null,
    description: "Professional technology reseller with focus on mobile devices and enterprise solutions.",
    agent_type: "reseller",
    position: 15,
    status: 1,
    logo_prompt: "Professional tech logo for Tech Reseller Pro, corporate design, navy blue and silver, professional style, square format"
  },
  {
    name: "Pacific Rim Distributors",
    email: "contact@pacrimdist.com",
    phone: "+61-2-9876-5432",
    whatsapp: "+61-2-9876-5432",
    address: "852 Harbor Boulevard, Sydney, Australia 2000",
    country_code: "AU",
    website: "https://pacrimdist.com",
    telegram: "https://t.me/pacrimdist",
    description: "Major distributor serving Pacific Rim countries. Strong partnerships with leading manufacturers.",
    agent_type: "distributor",
    position: 16,
    status: 1,
    logo_prompt: "Pacific company logo for Pacific Rim Distributors, ocean theme design, blue and white, modern style, square format"
  },
  {
    name: "Mobile Solutions Plus",
    email: "sales@mobilesolutionsplus.com",
    phone: "+1-555-1009",
    whatsapp: "+1-555-1009",
    address: "258 Tech Center, Denver, CO 80201",
    country_code: "US",
    website: "https://mobilesolutionsplus.com",
    telegram: "https://t.me/mobilesolutionsplus",
    description: "Comprehensive mobile solutions reseller. Offering devices, firmware, and technical support services.",
    agent_type: "reseller",
    position: 17,
    status: 1,
    logo_prompt: "Solutions company logo for Mobile Solutions Plus, modern design, teal and white, plus symbol theme, square format"
  },
  {
    name: "Nordic Mobile Distributors",
    email: "info@nordicmobiledist.com",
    phone: "+46-8-123-456",
    whatsapp: "+46-8-123-456",
    address: "369 Business District, Stockholm, Sweden 111 57",
    country_code: "SE",
    website: "https://nordicmobiledist.com",
    telegram: "https://t.me/nordicmobiledist",
    description: "Leading distributor in Nordic countries. Known for quality products and excellent customer service.",
    agent_type: "distributor",
    position: 18,
    status: 1,
    logo_prompt: "Nordic company logo for Nordic Mobile Distributors, Scandinavian design, blue and white, minimalist style, square format"
  },
  {
    name: "Device Pro Resellers",
    email: "contact@deviceproresellers.com",
    phone: "+1-555-1010",
    whatsapp: "+1-555-1010",
    address: "147 Professional Plaza, Phoenix, AZ 85001",
    country_code: "US",
    website: "https://deviceproresellers.com",
    telegram: null,
    description: "Professional device reseller with expertise in mobile firmware and device customization services.",
    agent_type: "reseller",
    position: 19,
    status: 1,
    logo_prompt: "Professional logo for Device Pro Resellers, tech design, dark blue and orange, professional badge style, square format"
  },
  {
    name: "Global Tech Distributors",
    email: "sales@globaltechdist.com",
    phone: "+1-555-1011",
    whatsapp: "+1-555-1011",
    address: "963 World Trade Center, New York, NY 10048",
    country_code: "US",
    website: "https://globaltechdist.com",
    telegram: "https://t.me/globaltechdist",
    description: "International technology distributor with global reach. Serving customers in 50+ countries worldwide.",
    agent_type: "distributor",
    position: 20,
    status: 1,
    logo_prompt: "Global company logo for Global Tech Distributors, world map theme, blue and silver, international style, square format"
  }
];

// Function to download image from URL
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200 || response.statusCode === 301 || response.statusCode === 302) {
        if (response.statusCode === 301 || response.statusCode === 302) {
          return downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
        }
        
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve(filepath);
        });
        fileStream.on('error', reject);
      } else {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
      }
    }).on('error', reject);
  });
}

// Function to generate logo using OpenAI DALL-E
async function generateLogo(prompt, companyName) {
  try {
    console.log(`\n🎨 Generating logo for ${companyName}...`);
    console.log(`   Prompt: ${prompt.substring(0, 100)}...`);
    
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "url"
    });

    const imageUrl = response.data[0].url;
    console.log(`   ✅ Generated: ${imageUrl}`);
    
    return imageUrl;
  } catch (error) {
    console.error(`   ❌ Error generating logo for ${companyName}:`, error.message);
    throw error;
  }
}

async function seedAgents() {
  let connection;
  
  try {
    console.log('🌱 Starting to seed agents...\n');
    
    connection = await pool.getConnection();
    
    // Create agents directory if it doesn't exist
    const agentsDir = path.join(__dirname, '../public/media/agents');
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
      console.log(`📁 Created directory: ${agentsDir}\n`);
    }
    
    // Clear existing agents and social links
    console.log('🗑️  Clearing existing agents and social links...');
    await connection.execute('DELETE FROM res_agent_social_links');
    await connection.execute('DELETE FROM res_agents');
    console.log('✅ Cleared existing data\n');
    
    // Insert agents
    console.log('👥 Inserting agents...\n');
    
    const insertedIds = [];
    
    for (const agent of agents) {
      try {
        // Generate logo
        const logoUrl = await generateLogo(agent.logo_prompt, agent.name);
        
        // Create filename from company name
        const filename = `${agent.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.jpg`;
        const filepath = path.join(agentsDir, filename);
        
        // Download and save locally
        console.log(`   💾 Downloading to: ${filepath}`);
        await downloadImage(logoUrl, filepath);
        console.log(`   ✅ Saved locally: ${filename}`);
        
        // Insert agent into database
        const query = `
          INSERT INTO res_agents 
          (name, email, phone, whatsapp, address, country_code, website, telegram, description, logo, status, position, agent_type, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;
        
        const [result] = await connection.execute(query, [
          agent.name,
          agent.email,
          agent.phone,
          agent.whatsapp,
          agent.address,
          agent.country_code,
          agent.website,
          agent.telegram,
          agent.description,
          filename, // Store only filename
          agent.status,
          agent.position,
          agent.agent_type
        ]);
        
        insertedIds.push({
          agent_id: result.insertId,
          name: agent.name
        });
        
        console.log(`   ✅ Created: ${agent.name} (ID: ${result.insertId}) - ${agent.agent_type}`);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`   ⚠️  Skipping ${agent.name} due to error:`, error.message);
        continue;
      }
    }
    
    console.log('\n🎉 Successfully seeded agents!\n');
    
    // Display statistics
    const [totalResult] = await connection.execute('SELECT COUNT(*) as count FROM res_agents');
    const [resellerResult] = await connection.execute('SELECT COUNT(*) as count FROM res_agents WHERE agent_type = "reseller"');
    const [distributorResult] = await connection.execute('SELECT COUNT(*) as count FROM res_agents WHERE agent_type = "distributor"');
    const [activeResult] = await connection.execute('SELECT COUNT(*) as count FROM res_agents WHERE status = 1');
    const [countryResult] = await connection.execute('SELECT COUNT(DISTINCT country_code) as count FROM res_agents');
    
    console.log('📊 Agent Statistics:');
    console.log(`   Total Agents: ${totalResult[0].count}`);
    console.log(`   Resellers: ${resellerResult[0].count}`);
    console.log(`   Distributors: ${distributorResult[0].count}`);
    console.log(`   Active Agents: ${activeResult[0].count}`);
    console.log(`   Countries Represented: ${countryResult[0].count}\n`);
    
    // Show all agents
    console.log('👥 All Agents:');
    const [allAgents] = await connection.execute(`
      SELECT name, agent_type, country_code, logo, email, phone
      FROM res_agents
      ORDER BY position ASC
    `);
    
    allAgents.forEach((agent, index) => {
      console.log(`   ${index + 1}. ${agent.name} - ${agent.agent_type}`);
      console.log(`      📧 ${agent.email} | 📱 ${agent.phone}`);
      console.log(`      🌍 ${agent.country_code} | 🖼️  Logo: ${agent.logo}`);
    });
    
  } catch (error) {
    console.error('❌ Error seeding agents:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Run the seed function
seedAgents()
  .then(() => {
    console.log('\n✅ Seed completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  });

