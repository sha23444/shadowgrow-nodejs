const { pool } = require('../config/database');

// Realistic team members data (8 members)
const teamMembers = [
  {
    name: "Sarah Johnson",
    designation: "Senior Firmware Developer",
    email: "sarah.johnson@shadowgrow.com",
    phone: "+1-555-0123",
    gender: "Female",
    bio: null,
    address: "123 Tech Street, San Francisco, CA 94102",
    country: "US",
    photo: "https://i.pravatar.cc/150?img=1",
    video: null,
    skills: ["Android Development", "Firmware Flashing", "Custom ROM Development"],
    status: 1,
    position: 1,
    social_links: [
      { platform: "linkedin", url: "https://linkedin.com/in/sarahjohnson" },
      { platform: "github", url: "https://github.com/sarahjohnson" },
      { platform: "twitter", url: "https://twitter.com/sarahjohnson" }
    ]
  },
  {
    name: "Michael Chen",
    designation: "Mobile Device Specialist",
    email: "michael.chen@shadowgrow.com",
    phone: "+1-555-0124",
    gender: "Male",
    bio: null,
    address: "456 Innovation Drive, Austin, TX 78701",
    country: "US",
    photo: "https://i.pravatar.cc/150?img=12",
    video: null,
    skills: ["Device Repair", "Hardware Analysis", "Odin Flash Tool"],
    status: 1,
    position: 2,
    social_links: [
      { platform: "linkedin", url: "https://linkedin.com/in/michaelchen" },
      { platform: "youtube", url: "https://youtube.com/@michaelchen" }
    ]
  },
  {
    name: "Emily Rodriguez",
    designation: "Android Development Lead",
    email: "emily.rodriguez@shadowgrow.com",
    phone: "+1-555-0125",
    gender: "Female",
    bio: null,
    address: "789 Code Avenue, Seattle, WA 98101",
    country: "US",
    photo: "https://i.pravatar.cc/150?img=5",
    video: "https://youtube.com/watch?v=intro123",
    skills: ["Android Development", "System Programming", "Performance Optimization"],
    status: 1,
    position: 3,
    social_links: [
      { platform: "linkedin", url: "https://linkedin.com/in/emilyrodriguez" },
      { platform: "github", url: "https://github.com/emilyrodriguez" },
      { platform: "twitter", url: "https://twitter.com/emilyrodriguez" },
      { platform: "instagram", url: "https://instagram.com/emilyrodriguez" }
    ]
  },
  {
    name: "David Kim",
    designation: "Firmware Testing Engineer",
    email: "david.kim@shadowgrow.com",
    phone: "+82-10-1234",
    gender: "Male",
    bio: null,
    address: "321 Quality Boulevard, Seoul, South Korea",
    country: "KR",
    photo: "https://i.pravatar.cc/150?img=15",
    video: null,
    skills: ["Software Testing", "Quality Assurance", "Automated Testing"],
    status: 1,
    position: 4,
    social_links: [
      { platform: "linkedin", url: "https://linkedin.com/in/davidkim" },
      { platform: "github", url: "https://github.com/davidkim" }
    ]
  },
  {
    name: "Priya Patel",
    designation: "Custom ROM Developer",
    email: "priya.patel@shadowgrow.com",
    phone: "+91-98765",
    gender: "Female",
    bio: null,
    address: "654 Developer Road, Bangalore, Karnataka 560001",
    country: "IN",
    photo: "https://i.pravatar.cc/150?img=47",
    video: null,
    skills: ["Custom ROM Development", "LineageOS", "AOSP"],
    status: 1,
    position: 5,
    social_links: [
      { platform: "github", url: "https://github.com/priyapatel" },
      { platform: "twitter", url: "https://twitter.com/priyapatel" },
      { platform: "telegram", url: "https://t.me/priyapatel" }
    ]
  },
  {
    name: "James Wilson",
    designation: "Device Support Specialist",
    email: "james.wilson@shadowgrow.com",
    phone: "+44-20-7946",
    gender: "Male",
    bio: null,
    address: "987 Support Street, London, UK SW1A 1AA",
    country: "GB",
    photo: "https://i.pravatar.cc/150?img=33",
    video: null,
    skills: ["Customer Support", "Technical Writing", "Device Troubleshooting"],
    status: 1,
    position: 6,
    social_links: [
      { platform: "linkedin", url: "https://linkedin.com/in/jameswilson" },
      { platform: "twitter", url: "https://twitter.com/jameswilson" }
    ]
  },
  {
    name: "Lisa Anderson",
    designation: "Quality Assurance Manager",
    email: "lisa.anderson@shadowgrow.com",
    phone: "+1-555-0126",
    gender: "Female",
    bio: null,
    address: "147 Quality Lane, Boston, MA 02101",
    country: "US",
    photo: "https://i.pravatar.cc/150?img=20",
    video: "https://youtube.com/watch?v=qa-intro456",
    skills: ["Quality Assurance", "Test Management", "Team Leadership"],
    status: 1,
    position: 7,
    social_links: [
      { platform: "linkedin", url: "https://linkedin.com/in/lisaanderson" },
      { platform: "twitter", url: "https://twitter.com/lisaanderson" },
      { platform: "youtube", url: "https://youtube.com/@lisaanderson" }
    ]
  },
  {
    name: "Ahmed Hassan",
    designation: "Mobile Repair Technician",
    email: "ahmed.hassan@shadowgrow.com",
    phone: "+971-50-123",
    gender: "Male",
    bio: null,
    address: "258 Repair Center, Dubai, UAE",
    country: "AE",
    photo: "https://i.pravatar.cc/150?img=51",
    video: null,
    skills: ["Device Repair", "Hardware Analysis", "SP Flash Tool"],
    status: 1,
    position: 8,
    social_links: [
      { platform: "linkedin", url: "https://linkedin.com/in/ahmedhassan" },
      { platform: "instagram", url: "https://instagram.com/ahmedhassan" },
      { platform: "youtube", url: "https://youtube.com/@ahmedhassan" }
    ]
  }
];

async function seedTeamMembers() {
  let connection;
  
  try {
    console.log('🌱 Starting to seed team members...\n');
    
    connection = await pool.getConnection();
    
    // Start transaction
    await connection.beginTransaction();
    
    // Clear existing team members and social links
    console.log('🗑️  Clearing existing team members and social links...');
    await connection.execute('DELETE FROM res_team_social_links');
    await connection.execute('DELETE FROM res_team');
    console.log('✅ Cleared existing data\n');
    
    // Insert team members
    console.log('👥 Inserting team members...\n');
    
    const insertedIds = [];
    
    for (const member of teamMembers) {
      const query = `
        INSERT INTO res_team 
        (name, designation, email, photo, phone, gender, bio, address, country, video, skills, status, position, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `;
      
      const [result] = await connection.execute(query, [
        member.name,
        member.designation,
        member.email,
        member.photo,
        member.phone,
        member.gender,
        member.bio,
        member.address,
        member.country,
        member.video,
        JSON.stringify(member.skills),
        member.status,
        member.position
      ]);
      
      insertedIds.push({
        team_id: result.insertId,
        name: member.name,
        social_links: member.social_links
      });
      
      console.log(`  ✅ Created: ${member.name} - ${member.designation} (ID: ${result.insertId})`);
    }
    
    // Insert social links
    console.log('\n🔗 Inserting social links...\n');
    
    const socialLinksToInsert = [];
    for (const member of insertedIds) {
      for (const link of member.social_links) {
        socialLinksToInsert.push([member.team_id, link.platform, link.url]);
      }
    }
    
    if (socialLinksToInsert.length > 0) {
      const socialQuery = `
        INSERT INTO res_team_social_links (team_id, platform, url) 
        VALUES ?
      `;
      
      await connection.query(socialQuery, [socialLinksToInsert]);
      console.log(`  ✅ Inserted ${socialLinksToInsert.length} social links`);
    }
    
    // Commit transaction
    await connection.commit();
    
    console.log('\n🎉 Successfully seeded team members!\n');
    
    // Display statistics
    const [totalResult] = await connection.execute('SELECT COUNT(*) as count FROM res_team');
    const [activeResult] = await connection.execute('SELECT COUNT(*) as count FROM res_team WHERE status = 1');
    const [socialResult] = await connection.execute('SELECT COUNT(*) as count FROM res_team_social_links');
    const [countryResult] = await connection.execute('SELECT COUNT(DISTINCT country) as count FROM res_team');
    
    console.log('📊 Team Statistics:');
    console.log(`   Total Team Members: ${totalResult[0].count}`);
    console.log(`   Active Members: ${activeResult[0].count}`);
    console.log(`   Total Social Links: ${socialResult[0].count}`);
    console.log(`   Countries Represented: ${countryResult[0].count}\n`);
    
    // Show all team members
    console.log('👥 All Team Members:');
    teamMembers.forEach((member, index) => {
      console.log(`   ${index + 1}. ${member.name} - ${member.designation}`);
      console.log(`      📧 ${member.email} | 📱 ${member.phone}`);
      console.log(`      🌍 ${member.country} | 🎯 Skills: ${member.skills.slice(0, 3).join(', ')}`);
      console.log(`      🔗 Social: ${member.social_links.map(l => l.platform).join(', ')}`);
      if (member.video) {
        console.log(`      🎥 Video: ${member.video}`);
      }
      console.log('');
    });
    
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('❌ Error seeding team members:', error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
    await pool.end();
  }
}

// Run the seed function
seedTeamMembers()
  .then(() => {
    console.log('✅ Seed completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Seed failed:', error);
    process.exit(1);
  });

