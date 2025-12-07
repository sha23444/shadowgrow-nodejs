const { pool } = require("../../config/database");


async function createReview(req, res) {
  const { id } = req.user;
  const user_id = id;

  const {
    item_type,
    item_id,
    rating,
    review_text,
    title,
    media
  } = req.body;

  if (!item_type || !item_id || !review_text || !rating) {
    return res.status(400).json({
      message: "Item type, item ID, rating, and review text are required",
      status: "error",
    });
  }

  try {
    // Set review as 'pending' by default
    const [result] = await pool.query(
      `INSERT INTO res_reviews (user_id, item_type, item_id, rating, review_text, title, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, item_type, item_id, rating, review_text, title, 'pending']
    );

    const review_id = result.insertId;

    // Insert media if available
    if (media && Array.isArray(media)) {
      const mediaInsertPromises = media.map((url) =>
        pool.query(
          `INSERT INTO res_review_media (review_id, media_url) VALUES (?, ?)`,
          [review_id, url]
        )
      );
      await Promise.all(mediaInsertPromises);
    }

    res.status(201).json({
      message: "Review submitted for approval",
      status: "success",
    });
  } catch (err) {
    console.error("Error creating review:", err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}


async function getFileReviews(req, res) {
  const { item_type, item_id, page = 1, limit = 10 } = req.query;

  if (!item_type || !item_id) {
    return res.status(400).json({
      message: "Valid item_type and item_id are required",
      status: "error",
    });
  }

  const offset = (page - 1) * limit;

  try {
    const reviewsQuery = `
      SELECT r.*, u.first_name, u.last_name, u.photo, u.email
      FROM res_reviews r
      LEFT JOIN res_users u ON r.user_id = u.user_id
      WHERE r.item_type = ? AND r.item_id = ? AND r.status = 'approved'
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) AS total_reviews
      FROM res_reviews
      WHERE item_type = ? AND item_id = ? AND status = 'approved'
    `;

    const starSumQuery = `
      SELECT IFNULL(SUM(rating), 0) AS total_star_sum
      FROM res_reviews
      WHERE item_type = ? AND item_id = ? AND status = 'approved'
    `;

    // NEW: get count of each star rating
    const distributionQuery = `
      SELECT rating, COUNT(*) AS count
      FROM res_reviews
      WHERE item_type = ? AND item_id = ? AND status = 'approved'
      GROUP BY rating
    `;

    const [reviews] = await pool.query(reviewsQuery, [item_type, item_id, parseInt(limit), parseInt(offset)]);
    const [[{ total_reviews }]] = await pool.query(countQuery, [item_type, item_id]);
    const [[{ total_star_sum }]] = await pool.query(starSumQuery, [item_type, item_id]);
    const [distribution] = await pool.query(distributionQuery, [item_type, item_id]);

    const average_rating = total_reviews ? (total_star_sum / total_reviews).toFixed(1) : "0.0";

    // Convert distribution to percentage per star
    const ratingPercentages = {};
    for (let i = 1; i <= 5; i++) {
      const found = distribution.find(row => row.rating === i);
      const percent = found ? Math.round((found.count / total_reviews) * 100) : 0;
      ratingPercentages[i] = percent;
    }

    return res.status(200).json({
      data: reviews,
      summary: {
        totalReviews: total_reviews,
        averageRating: average_rating,
        ratingPercentages,
        text: `${total_star_sum} Stars across ${total_reviews} Reviews`,
      },
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(total_reviews / limit),
        per_page: parseInt(limit),
      },
      status: "success",
    });
  } catch (err) {
    console.error("Error fetching item reviews:", err);
    return res.status(500).json({
      message: "An error occurred while fetching reviews",
      status: "error",
    });
  }
}




module.exports = {
  createReview,
  getFileReviews,
};
