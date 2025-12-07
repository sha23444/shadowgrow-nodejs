const { faker } = require('@faker-js/faker');

exports.seed = async function (knex) {
  // Deletes ALL existing entries
  await knex('res_review_media').del();
  await knex('res_reviews').del();

  // Get existing users and files
  const users = await knex('res_users').select('user_id', 'first_name', 'last_name', 'email').limit(200);
  const files = await knex('res_files').select('file_id', 'title', 'price').where('price', '>', 0);

  if (users.length === 0 || files.length === 0) {
    console.log('⚠️  No users or paid files found. Please run users and files seeds first.');
    return;
  }

  console.log(`⭐ Creating reviews for ${files.length} paid files...`);

  const reviews = [];
  const reviewMedia = [];

  // Mobile firmware review templates
  const reviewTemplates = {
    positive: [
      {
        title: "Excellent firmware!",
        text: "This firmware works perfectly on my device. Flashing was smooth and the device is running much better now. Highly recommended!"
      },
      {
        title: "Great tool for flashing",
        text: "Used this tool to flash my Samsung device. The process was straightforward and the results are amazing. My phone feels brand new!"
      },
      {
        title: "Perfect for my Xiaomi device",
        text: "Flashed this on my Redmi device and it's working flawlessly. The performance improvement is noticeable. Thanks for the great firmware!"
      },
      {
        title: "Reliable and fast",
        text: "Download was fast and the flashing process was smooth. My OnePlus device is now running the latest version. Very satisfied with this purchase."
      },
      {
        title: "Professional quality",
        text: "This is exactly what I needed for my device. The firmware is stable and all features are working perfectly. Worth every penny!"
      }
    ],
    neutral: [
      {
        title: "Good firmware overall",
        text: "The firmware works well on my device. Some minor issues but nothing major. Would recommend for basic flashing needs."
      },
      {
        title: "Decent tool",
        text: "Does what it's supposed to do. The flashing process took a bit longer than expected but the end result is good."
      },
      {
        title: "Average experience",
        text: "Firmware works fine but could be better. Some features are missing compared to other versions I've used."
      },
      {
        title: "Okay for the price",
        text: "Not the best firmware I've used but it gets the job done. Good value for money if you're on a budget."
      }
    ],
    negative: [
      {
        title: "Had some issues",
        text: "The firmware caused some problems on my device. Had to reflash with a different version. Not recommended for my device model."
      },
      {
        title: "Download was slow",
        text: "The download took forever and the flashing process was complicated. Ended up using a different tool instead."
      },
      {
        title: "Not compatible",
        text: "This firmware didn't work properly on my device. Caused boot loops and had to restore from backup."
      }
    ]
  };

  // Create reviews for each file
  for (const file of files) {
    // Each file gets 3-8 reviews
    const numReviews = faker.number.int({ min: 3, max: 8 });
    
    for (let i = 0; i < numReviews; i++) {
      const user = faker.helpers.arrayElement(users);
      
      // Determine review sentiment (70% positive, 20% neutral, 10% negative)
      const sentimentRand = Math.random();
      let sentiment, rating;
      
      if (sentimentRand < 0.7) {
        sentiment = 'positive';
        rating = faker.number.int({ min: 4, max: 5 });
      } else if (sentimentRand < 0.9) {
        sentiment = 'neutral';
        rating = faker.number.int({ min: 3, max: 4 });
      } else {
        sentiment = 'negative';
        rating = faker.number.int({ min: 1, max: 2 });
      }
      
      const template = faker.helpers.arrayElement(reviewTemplates[sentiment]);
      
      // Generate review
      const review = {
        user_id: user.user_id,
        item_type: 1, // Digital Files
        item_id: file.file_id,
        rating: rating,
        review_text: template.text,
        title: template.title,
        status: (() => {
          const rand = Math.random();
          if (rand < 0.8) return 'approved';      // 80% approved
          if (rand < 0.95) return 'pending';     // 15% pending
          return 'rejected';                     // 5% rejected
        })(),
        created_at: faker.date.between({
          from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
          to: new Date()
        })
      };

      reviews.push(review);
    }
  }

  // Insert reviews in batches
  console.log(`📝 Creating ${reviews.length} reviews...`);
  
  const batchSize = 100;
  for (let i = 0; i < reviews.length; i += batchSize) {
    const batch = reviews.slice(i, i + batchSize);
    await knex('res_reviews').insert(batch);
    console.log(`  ⭐ Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(reviews.length / batchSize)}`);
  }

  // Add some review media (screenshots, etc.)
  const approvedReviewsList = reviews.filter(r => r.status === 'approved');
  const mediaUrls = [
    'https://example.com/screenshots/flash-success-1.jpg',
    'https://example.com/screenshots/device-before.jpg',
    'https://example.com/screenshots/device-after.jpg',
    'https://example.com/screenshots/odin-tool.jpg',
    'https://example.com/screenshots/mi-flash-tool.jpg',
    'https://example.com/screenshots/firmware-info.jpg'
  ];

  // Add media to 20% of approved reviews
  const reviewsWithMedia = faker.helpers.arrayElements(approvedReviewsList, Math.floor(approvedReviewsList.length * 0.2));
  
  for (const review of reviewsWithMedia) {
    const numMedia = faker.number.int({ min: 1, max: 3 });
    const selectedMedia = faker.helpers.arrayElements(mediaUrls, numMedia);
    
    for (const mediaUrl of selectedMedia) {
      reviewMedia.push({
        review_id: review.id || faker.number.int({ min: 1, max: reviews.length }), // Will be updated after insert
        media_url: mediaUrl
      });
    }
  }

  // Insert review media
  if (reviewMedia.length > 0) {
    console.log(`📸 Creating ${reviewMedia.length} review media entries...`);
    
    // Get the actual review IDs from the database
    const insertedReviews = await knex('res_reviews').select('id', 'user_id', 'item_id').where('status', 'approved');
    
    // Update media with correct review IDs
    const mediaWithCorrectIds = [];
    for (let i = 0; i < Math.min(reviewMedia.length, insertedReviews.length); i++) {
      const review = insertedReviews[i];
      const media = reviewMedia[i];
      mediaWithCorrectIds.push({
        review_id: review.id,
        media_url: media.media_url
      });
    }
    
    await knex('res_review_media').insert(mediaWithCorrectIds);
    console.log(`  📸 Inserted ${mediaWithCorrectIds.length} media entries`);
  }

  // Update file ratings based on approved reviews
  console.log(`📊 Updating file ratings...`);
  
  for (const file of files) {
    const fileReviews = reviews.filter(r => r.item_id === file.file_id && r.status === 'approved');
    
    if (fileReviews.length > 0) {
      const totalRating = fileReviews.reduce((sum, review) => sum + review.rating, 0);
      const averageRating = totalRating / fileReviews.length;
      
      await knex('res_files')
        .where('file_id', file.file_id)
        .update({
          rating_count: fileReviews.length,
          rating_points: parseFloat(averageRating.toFixed(2))
        });
    }
  }

  // Generate summary statistics
  const totalReviews = reviews.length;
  const approvedReviews = reviews.filter(r => r.status === 'approved').length;
  const pendingReviews = reviews.filter(r => r.status === 'pending').length;
  const rejectedReviews = reviews.filter(r => r.status === 'rejected').length;
  
  const averageRating = reviews
    .filter(r => r.status === 'approved')
    .reduce((sum, review) => sum + review.rating, 0) / approvedReviews;

  // Rating distribution
  const ratingDistribution = {};
  for (let i = 1; i <= 5; i++) {
    ratingDistribution[i] = reviews.filter(r => r.rating === i && r.status === 'approved').length;
  }

  console.log(`\n🎉 Reviews Created Successfully!`);
  console.log(`📊 Summary:`);
  console.log(`   - Total reviews: ${totalReviews}`);
  console.log(`   - Approved reviews: ${approvedReviews} (${((approvedReviews/totalReviews)*100).toFixed(1)}%)`);
  console.log(`   - Pending reviews: ${pendingReviews} (${((pendingReviews/totalReviews)*100).toFixed(1)}%)`);
  console.log(`   - Rejected reviews: ${rejectedReviews} (${((rejectedReviews/totalReviews)*100).toFixed(1)}%)`);
  console.log(`   - Average rating: ${averageRating.toFixed(1)}/5.0`);
  console.log(`   - Review media: ${reviewMedia.length} entries`);

  console.log(`\n⭐ Rating Distribution:`);
  for (let i = 5; i >= 1; i--) {
    const count = ratingDistribution[i];
    const percentage = approvedReviews > 0 ? ((count / approvedReviews) * 100).toFixed(1) : 0;
    console.log(`   ${i} stars: ${count} reviews (${percentage}%)`);
  }

  // Show top rated files
  const topRatedFiles = await knex('res_files')
    .select('file_id', 'title', 'rating_points', 'rating_count')
    .where('rating_count', '>', 0)
    .orderBy('rating_points', 'desc')
    .limit(5);

  console.log(`\n🏆 Top Rated Files:`);
  topRatedFiles.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file.title} - ${file.rating_points}/5.0 (${file.rating_count} reviews)`);
  });

  console.log(`\n📱 Mobile Firmware Reviews Created Successfully!`);
};
