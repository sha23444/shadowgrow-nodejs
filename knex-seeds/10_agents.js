const { faker } = require('@faker-js/faker');

const mobileFirmwareAgentTypes = [
  'Mobile Firmware Distributor',
  'Device Repair Service',
  'Firmware Development Partner',
  'Technical Support Agent',
  'Custom ROM Provider',
  'Hardware Testing Partner',
  'Device Unlocking Service',
  'Firmware Flashing Service'
];

const countries = [
  { code: 'US', name: 'United States' },
  { code: 'IN', name: 'India' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'FR', name: 'France' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'BR', name: 'Brazil' },
  { code: 'SG', name: 'Singapore' }
];

const socialPlatforms = [
  'facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'telegram', 'whatsapp', 'website'
];

function generateAgent(index) {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const companyName = faker.company.name();
  const name = `${companyName} - ${firstName} ${lastName}`;
  const email = faker.internet.email({ firstName, lastName, provider: 'mobilefirmware.com' });
  const country = faker.helpers.arrayElement(countries);
  
  // Generate mobile firmware specific description
  const descriptionTemplates = [
    `Professional mobile firmware distributor specializing in ${faker.helpers.arrayElement(['Samsung', 'Xiaomi', 'OnePlus', 'Huawei'])} devices.`,
    `Expert device repair and firmware flashing service with ${faker.number.int({ min: 5, max: 20 })} years experience.`,
    `Custom ROM development and firmware modification services for Android devices.`,
    `Technical support agent providing firmware assistance and device troubleshooting.`,
    `Hardware testing partner for mobile firmware validation and quality assurance.`
  ];
  
  const description = faker.helpers.arrayElement(descriptionTemplates);
  
  // Generate contact information
  const phone = faker.phone.number().substring(0, 15); // Keep phone short
  const whatsapp = faker.phone.number().substring(0, 15);
  const address = faker.location.streetAddress({ useFullAddress: true });
  const website = `https://${faker.internet.domainName()}`;
  const telegram = `@${firstName.toLowerCase()}${lastName.toLowerCase()}`;
  
  // Generate logo URL
  const logo = faker.image.avatar();
  
  // Generate social links (2-4 platforms per agent)
  const numSocialLinks = faker.number.int({ min: 2, max: 4 });
  const selectedPlatforms = faker.helpers.arrayElements(socialPlatforms, numSocialLinks);
  const socialLinks = selectedPlatforms.map(platform => ({
    platform,
    url: platform === 'website' ? website : `https://${platform}.com/${firstName.toLowerCase()}${lastName.toLowerCase()}`
  }));
  
  return {
    name,
    email,
    phone,
    whatsapp,
    address,
    country_code: country.code,
    website,
    telegram,
    description,
    logo,
    status: 1, // Active
    position: index + 1,
    social_links: socialLinks
  };
}

exports.seed = async function(knex) {
  // Clear existing agents
  await knex('res_agent_social_links').del();
  await knex('res_agents').del();

  console.log('🤝 Creating 8 mobile firmware agents...');

  const agents = [];
  const socialLinksToInsert = [];

  // Generate 8 agents
  for (let i = 0; i < 8; i++) {
    const agent = generateAgent(i);
    agents.push(agent);
  }

  // Insert agents one by one to get their IDs
  const insertedAgentIds = [];
  for (const agent of agents) {
    const { social_links, ...agentData } = agent;
    const [insertedId] = await knex('res_agents').insert(agentData);
    insertedAgentIds.push(insertedId);
    
    // Prepare social links for this agent
    for (const link of social_links) {
      socialLinksToInsert.push({
        agent_id: insertedId,
        platform: link.platform,
        url: link.url
      });
    }
  }
  
  console.log(`✅ Inserted ${insertedAgentIds.length} agents`);

  if (socialLinksToInsert.length > 0) {
    await knex('res_agent_social_links').insert(socialLinksToInsert);
    console.log(`🔗 Inserted ${socialLinksToInsert.length} social links`);
  }

  // Display summary
  console.log('\n📊 Agents Created:');
  agents.forEach((agent, index) => {
    console.log(`   ${index + 1}. ${agent.name}`);
    console.log(`      📧 ${agent.email} | 📱 ${agent.phone}`);
    console.log(`      🌍 ${agent.country_code} | 🔗 ${agent.website}`);
    console.log(`      📝 ${agent.description.substring(0, 80)}...`);
    console.log(`      🔗 Social: ${agent.social_links.map(l => l.platform).join(', ')}`);
    console.log('');
  });

  console.log('🎉 Mobile Firmware Agents Created Successfully!');
  console.log(`📈 Summary:`);
  console.log(`   - Total agents: ${agents.length}`);
  console.log(`   - Total social links: ${socialLinksToInsert.length}`);
  console.log(`   - Countries represented: ${[...new Set(agents.map(a => a.country_code))].length}`);
  console.log(`   - Agent types: ${mobileFirmwareAgentTypes.length} different specializations`);
};
