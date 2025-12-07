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

// Team member image generation prompts
const teamMemberPrompts = [
  {
    name: "Sarah Johnson",
    prompt: "Professional headshot portrait of a confident female software engineer in her early 30s, wearing a modern business casual blazer, friendly smile, short brown hair, clean white background, professional photography, high quality, 4K, tech industry professional, approachable and intelligent expression"
  },
  {
    name: "Michael Chen",
    prompt: "Professional headshot portrait of an Asian male technician in his late 20s, wearing a smart casual shirt, warm smile, black hair, clean light gray background, professional photography, high quality, 4K, mobile technology expert, friendly and knowledgeable expression"
  },
  {
    name: "Emily Rodriguez",
    prompt: "Professional headshot portrait of a confident Hispanic female tech lead in her early 30s, wearing a professional blouse, bright smile, long dark hair, clean white background, professional photography, high quality, 4K, software development leader, energetic and professional expression"
  },
  {
    name: "David Kim",
    prompt: "Professional headshot portrait of a Korean male engineer in his mid-30s, wearing a business casual shirt, friendly smile, neat black hair, clean light blue background, professional photography, high quality, 4K, quality assurance professional, detail-oriented and approachable expression"
  },
  {
    name: "Priya Patel",
    prompt: "Professional headshot portrait of an Indian female developer in her late 20s, wearing a modern professional top, warm smile, long dark hair, clean white background, professional photography, high quality, 4K, open-source developer, creative and intelligent expression"
  },
  {
    name: "James Wilson",
    prompt: "Professional headshot portrait of a British male support specialist in his early 30s, wearing a business casual shirt, friendly smile, short brown hair, clean light gray background, professional photography, high quality, 4K, customer service professional, helpful and approachable expression"
  },
  {
    name: "Lisa Anderson",
    prompt: "Professional headshot portrait of a confident female manager in her mid-30s, wearing a professional blazer, warm smile, shoulder-length blonde hair, clean white background, professional photography, high quality, 4K, quality assurance manager, leadership and professional expression"
  },
  {
    name: "Ahmed Hassan",
    prompt: "Professional headshot portrait of a Middle Eastern male technician in his early 30s, wearing a smart casual shirt, friendly smile, short dark hair and beard, clean light gray background, professional photography, high quality, 4K, mobile repair expert, skilled and approachable expression"
  }
];

// Function to download image from URL
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      if (response.statusCode === 200 || response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
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

// Function to generate image using OpenAI DALL-E
async function generateImage(prompt, memberName) {
  try {
    console.log(`\n🎨 Generating image for ${memberName}...`);
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
    console.error(`   ❌ Error generating image for ${memberName}:`, error.message);
    throw error;
  }
}

// Function to update database with filename only
async function updateTeamMemberPhoto(connection, name, filename) {
  try {
    const query = 'UPDATE res_team SET photo = ? WHERE name = ?';
    await connection.execute(query, [filename, name]);
    console.log(`   ✅ Updated database for ${name} with filename: ${filename}`);
  } catch (error) {
    console.error(`   ❌ Error updating database for ${name}:`, error.message);
    throw error;
  }
}

async function generateTeamMemberImages() {
  let connection;
  
  try {
    console.log('🎨 Starting to generate team member images...\n');
    
    connection = await pool.getConnection();
    
    // Create images directory if it doesn't exist
    const imagesDir = path.join(__dirname, '../public/media/teams');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
      console.log(`📁 Created directory: ${imagesDir}\n`);
    }
    
    // Generate images for each team member
    for (const member of teamMemberPrompts) {
      try {
        // Generate image
        const imageUrl = await generateImage(member.prompt, member.name);
        
        // Create filename from member name
        const filename = `${member.name.toLowerCase().replace(/\s+/g, '-')}.jpg`;
        const filepath = path.join(imagesDir, filename);
        
        // Download and save locally
        console.log(`   💾 Downloading to: ${filepath}`);
        await downloadImage(imageUrl, filepath);
        console.log(`   ✅ Saved locally: ${filename}`);
        
        // Update database with filename only (not full path)
        await updateTeamMemberPhoto(connection, member.name, filename);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`   ⚠️  Skipping ${member.name} due to error:`, error.message);
        continue;
      }
    }
    
    console.log('\n🎉 Successfully generated and updated team member images!\n');
    
    // Display updated team members
    const [teamMembers] = await connection.execute(`
      SELECT name, designation, photo 
      FROM res_team 
      ORDER BY position ASC
    `);
    
    console.log('📸 Updated Team Members:');
    teamMembers.forEach((member, index) => {
      console.log(`   ${index + 1}. ${member.name} - ${member.designation}`);
      console.log(`      Image: ${member.photo || 'Not set'}`);
    });
    
  } catch (error) {
    console.error('❌ Error generating team member images:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Run the generation function
generateTeamMemberImages()
  .then(() => {
    console.log('\n✅ Image generation completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Image generation failed:', error);
    process.exit(1);
  });

