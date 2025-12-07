const { faker } = require('@faker-js/faker');

const mobileFirmwareSkills = [
  'Android Development', 'Firmware Flashing', 'Custom ROM Development', 'Bootloader Unlocking',
  'Device Rooting', 'Kernel Development', 'Recovery Development', 'ADB/Fastboot',
  'Odin Flash Tool', 'Mi Flash Tool', 'SP Flash Tool', 'MSM Download Tool',
  'USB Driver Development', 'Device Testing', 'Quality Assurance', 'Technical Writing',
  'Customer Support', 'Device Repair', 'Hardware Analysis', 'Software Testing'
];

const designations = [
  'Senior Firmware Developer',
  'Mobile Device Specialist',
  'Android Development Lead',
  'Firmware Testing Engineer',
  'Custom ROM Developer',
  'Device Support Specialist',
  'Technical Documentation Writer',
  'Quality Assurance Manager',
  'Hardware Testing Engineer',
  'Customer Support Lead',
  'Mobile Repair Technician',
  'Software Development Manager'
];

const countries = [
  'United States', 'India', 'United Kingdom', 'Germany', 'Canada', 'Australia',
  'Netherlands', 'France', 'Japan', 'South Korea', 'Brazil', 'Singapore'
];

const socialPlatforms = [
  'linkedin', 'twitter', 'github', 'facebook', 'instagram', 'youtube', 'telegram', 'discord'
];

function generateTeamMember(index) {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const name = `${firstName} ${lastName}`;
  const designation = faker.helpers.arrayElement(designations);
  const email = faker.internet.email({ firstName, lastName, provider: 'mobilefirmware.com' });
  const gender = faker.person.sex();
  const country = faker.helpers.arrayElement(countries);
  
  // Set bio to null to avoid column length issues
  const bio = null;
  
  // Generate skills (3-6 skills per person)
  const numSkills = faker.number.int({ min: 3, max: 6 });
  const skills = faker.helpers.arrayElements(mobileFirmwareSkills, numSkills);
  
  // Generate social links (2-4 platforms per person)
  const numSocialLinks = faker.number.int({ min: 2, max: 4 });
  const selectedPlatforms = faker.helpers.arrayElements(socialPlatforms, numSocialLinks);
  const socialLinks = selectedPlatforms.map(platform => ({
    platform,
    url: `https://${platform}.com/${firstName.toLowerCase()}${lastName.toLowerCase()}`
  }));
  
  // Generate short phone number to fit database column
  const phone = faker.phone.number().substring(0, 15);
  
  // Generate address
  const address = faker.location.streetAddress({ useFullAddress: true });
  
  // Generate photo URL (using faker's avatar service)
  const photo = faker.image.avatar();
  
  // Generate video URL (optional, some team members might have intro videos)
  const hasVideo = Math.random() < 0.3; // 30% chance of having a video
  const video = hasVideo ? `https://youtube.com/watch?v=${faker.string.alphanumeric(11)}` : null;
  
  return {
    name,
    designation,
    email,
    photo,
    phone,
    gender,
    bio,
    address,
    country,
    video,
    skills: JSON.stringify(skills),
    status: 1, // Active
    position: index + 1,
    social_links: socialLinks // Keep for later processing
  };
}

exports.seed = async function(knex) {
  // Clear existing team members
  await knex('res_team_social_links').del();
  await knex('res_team').del();

  console.log('👥 Creating 12 mobile firmware team members...');

  const teamMembers = [];
  const socialLinksToInsert = [];

  // Generate 12 team members
  for (let i = 0; i < 12; i++) {
    const member = generateTeamMember(i);
    teamMembers.push(member);
  }

  // Insert team members one by one to get their IDs
  const insertedMemberIds = [];
  for (const member of teamMembers) {
    const { social_links, ...memberData } = member;
    const [insertedId] = await knex('res_team').insert(memberData);
    insertedMemberIds.push(insertedId);
    
    // Prepare social links for this member
    for (const link of social_links) {
      socialLinksToInsert.push({
        team_id: insertedId,
        platform: link.platform,
        url: link.url
      });
    }
  }
  
  console.log(`✅ Inserted ${insertedMemberIds.length} team members`);

  if (socialLinksToInsert.length > 0) {
    await knex('res_team_social_links').insert(socialLinksToInsert);
    console.log(`🔗 Inserted ${socialLinksToInsert.length} social links`);
  }

  // Display summary
  console.log('\n📊 Team Members Created:');
  teamMembers.forEach((member, index) => {
    console.log(`   ${index + 1}. ${member.name} - ${member.designation}`);
    console.log(`      📧 ${member.email} | 📱 ${member.phone}`);
    console.log(`      🌍 ${member.country} | 🎯 Skills: ${JSON.parse(member.skills).slice(0, 3).join(', ')}`);
    console.log(`      🔗 Social: ${member.social_links.map(l => l.platform).join(', ')}`);
    console.log('');
  });

  console.log('🎉 Mobile Firmware Team Created Successfully!');
  console.log(`📈 Summary:`);
  console.log(`   - Total team members: ${teamMembers.length}`);
  console.log(`   - Total social links: ${socialLinksToInsert.length}`);
  console.log(`   - Countries represented: ${[...new Set(teamMembers.map(m => m.country))].length}`);
  console.log(`   - Unique skills: ${[...new Set(teamMembers.flatMap(m => JSON.parse(m.skills)))].length}`);
};
