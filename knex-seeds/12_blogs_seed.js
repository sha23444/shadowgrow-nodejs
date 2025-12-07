/**
 * Seed sample blogs, categories, and tags for development.
 */

exports.seed = async function (knex) {
  // Categories
  const categories = [
    { name: 'Announcements' },
    { name: 'Guides' },
    { name: 'Updates' },
    { name: 'Tutorials' },
    { name: 'Tips & Tricks' },
  ];

  // Temporarily disable FK checks for clean reseed
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0;');
  try {
    // Clear relationships first to avoid FK issues
    await knex('res_blogs_categories_relationship').del();
    await knex('tag_map').where({ ref_type: 'blog' }).del();
    await knex('res_blogs').del();
    await knex('res_blogs_categories').del();
    await knex('tags').del();
  } finally {
    await knex.raw('SET FOREIGN_KEY_CHECKS = 1;');
  }

  // Insert categories
  const categoryIds = [];
  for (const c of categories) {
    const [id] = await knex('res_blogs_categories').insert({ name: c.name });
    categoryIds.push(id);
  }

  // Insert tags (kept for system consistency; not mapped to blogs because tag_map doesn't support 'blog')
  const tagNames = ['release', 'how-to', 'performance', 'security', 'features', 'getting-started', 'tips'];
  const tagIds = [];
  for (const tag of tagNames) {
    const [id] = await knex('tags').insert({ tag });
    tagIds.push({ id, tag });
  }

  // Realistic blog entries (~10)
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const blogsData = [
    {
      title: 'How to Choose the Right Indoor Plants for Low Light',
      content:
        '<p>Not every room is flooded with sun. In this guide, we explore resilient, low-light plants like ZZ, pothos, and snake plants, plus watering and soil tips to keep them thriving.</p>',
      author: 'Editorial Team',
      slug: 'choose-indoor-plants-low-light',
      excerpt: 'A quick guide to plants that love shade — and how to care for them.',
      featured_image: 'blogs/low-light-plants.jpg',
      gallery: JSON.stringify([]),
      status: 'published',
      created_at: now,
    },
    {
      title: 'The Complete Beginner’s Guide to Herb Gardening',
      content:
        '<p>Basil, mint, rosemary — herbs are easy and rewarding. Learn containers vs raised beds, watering rhythms, and harvesting for maximum flavor.</p>',
      author: 'Garden Coach',
      slug: 'beginners-guide-herb-gardening',
      excerpt: 'Start small, grow fresh: everything you need for a thriving herb patch.',
      featured_image: 'blogs/herb-garden.jpg',
      gallery: JSON.stringify([]),
      status: 'published',
      created_at: now,
    },
    {
      title: 'Soil Basics: Drainage, Aeration, and Organic Matter',
      content:
        '<p>Great soil grows great plants. We break down drainage, aeration, and how compost improves structure and microbial life for healthier roots.</p>',
      author: 'Soil Lab',
      slug: 'soil-basics-drainage-aeration-organic-matter',
      excerpt: 'Understand what’s under your plants — and why it matters.',
      featured_image: 'blogs/soil-basics.jpg',
      gallery: JSON.stringify([]),
      status: 'published',
      created_at: now,
    },
    {
      title: 'Seasonal Care Checklist: Autumn Prep for Spring Bloom',
      content:
        '<p>From mulching to pruning and bulb planting, use this checklist to set your garden up for a spectacular spring display.</p>',
      author: 'Editorial Team',
      slug: 'seasonal-care-checklist-autumn-prep',
      excerpt: 'Do the work now — reap the rewards next season.',
      featured_image: 'blogs/autumn-prep.jpg',
      gallery: JSON.stringify([]),
      status: 'draft',
      created_at: now,
    },
    {
      title: 'Pest Management 101: Natural Remedies That Work',
      content:
        '<p>Neem oil, beneficial insects, and cultural practices can keep pests in check. Here’s how to build a resilient plant ecosystem.</p>',
      author: 'Garden Coach',
      slug: 'pest-management-natural-remedies',
      excerpt: 'Keep plants healthy with low-tox, high-impact strategies.',
      featured_image: 'blogs/pest-management.jpg',
      gallery: JSON.stringify([]),
      status: 'published',
      created_at: now,
    },
    {
      title: 'Repotting Without Stress: A Step-by-Step Guide',
      content:
        '<p>Rootbound symptoms, pot sizing, and soil mixes — plus timing and aftercare tips to make repotting smooth for you and your plants.</p>',
      author: 'Editorial Team',
      slug: 'repotting-step-by-step',
      excerpt: 'Make repotting easy for happier, faster-growing plants.',
      featured_image: 'blogs/repotting-guide.jpg',
      gallery: JSON.stringify([]),
      status: 'published',
      created_at: now,
    },
    {
      title: 'Watering Myths: How Much is Too Much?',
      content:
        '<p>Overwatering is the #1 plant killer. Learn how to check moisture, set a schedule, and adapt to seasons and potting media.</p>',
      author: 'Garden Coach',
      slug: 'watering-myths-how-much',
      excerpt: 'Right water, right time — your plants will thank you.',
      featured_image: 'blogs/watering-myths.jpg',
      gallery: JSON.stringify([]),
      status: 'published',
      created_at: now,
    },
    {
      title: 'Designing a Balcony Garden: Small Space, Big Impact',
      content:
        '<p>Vertical planters, trailing species, and micro-irrigation can turn any balcony into a lush retreat. Here’s how to plan and plant.</p>',
      author: 'Design Studio',
      slug: 'designing-balcony-garden-small-space',
      excerpt: 'Maximize beauty in minimal square footage.',
      featured_image: 'blogs/balcony-garden.jpg',
      gallery: JSON.stringify([]),
      status: 'draft',
      created_at: now,
    },
    {
      title: 'Fertilizers Demystified: N-P-K and When to Feed',
      content:
        '<p>From slow-release to organics, we explain N-P-K ratios and how to feed through growth spurts without burning roots.</p>',
      author: 'Soil Lab',
      slug: 'fertilizers-demystified-npk',
      excerpt: 'Feed smarter for stronger growth.',
      featured_image: 'blogs/fertilizers-npk.jpg',
      gallery: JSON.stringify([]),
      status: 'published',
      created_at: now,
    },
    {
      title: 'Propagating Pothos: Cuttings that Root Fast',
      content:
        '<p>Pothos are propagation all-stars. We cover water vs soil methods, light needs, and transplanting for quick success.</p>',
      author: 'Editorial Team',
      slug: 'propagating-pothos-cuttings',
      excerpt: 'Multiply your plants the easy way.',
      featured_image: 'blogs/propagating-pothos.jpg',
      gallery: JSON.stringify([]),
      status: 'published',
      created_at: now,
    },
  ];

  const blogIds = [];
  let relationshipId = 1;
  for (const blog of blogsData) {
    const [blogId] = await knex('res_blogs').insert(blog);
    blogIds.push(blogId);

    // Random category mapping
    const randomCategoryId = categoryIds[Math.floor(Math.random() * categoryIds.length)];
    await knex('res_blogs_categories_relationship').insert([
      {
        id: relationshipId++,
        blog_id: blogId,
        category_id: randomCategoryId,
      },
    ]);

    // Skip mapping tags to blogs because tag_map.ref_type enum doesn't include 'blog'
  }
};


