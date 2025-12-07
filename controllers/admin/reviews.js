const { pool } = require("../../config/database");

async function updateReviewStatus(req, res) {
  const { status, review_id} = req.body; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const connection = await pool.getConnection(); // Get a connection for transaction

  try {
    await connection.beginTransaction(); // Start transaction

    await connection.query(
      `UPDATE res_reviews SET status = ? WHERE id = ?`,
      [status, review_id]
    );

    // Increment the rating count and calculate the new average rating only if the status is 'approved'
    if (status === 'approved') {
      // Fetch item_id from the review
      const [review] = await connection.query(
        `SELECT item_id FROM res_reviews WHERE id = ?`,
        [review_id]
      );

      if (!review.length) {
        await connection.rollback(); // Rollback transaction
        return res.status(404).json({ message: "Review not found" });
      }

      await connection.query(
        `UPDATE res_files
         SET rating_count = rating_count + 1,
           rating_points = (rating_points * (rating_count) + (SELECT rating FROM res_reviews WHERE id = ?)) / (rating_count + 1)
         WHERE file_id = ?`,
        [review_id, review[0].item_id]
      );
    }

    await connection.commit(); // Commit transaction

    res.json({
      message: `Review ${status} successfully`,
      status: "success",
    });
  } catch (err) {
    await connection.rollback(); // Rollback transaction on error
    console.error("Error updating review status:", err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  } finally {
    connection.release(); // Release connection
  }
}


async function getFileReviews(req, res) {
  const { item_type, item_id, status = 'approved', page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let reviewsQuery, aggregatesQuery, queryParams;

    if (item_type && item_id) {
      // Get reviews for specific item
      reviewsQuery = `
        SELECT r.*, u.first_name, u.last_name, u.photo, u.email, f.title as file_title
        FROM res_reviews r
        LEFT JOIN res_users u ON r.user_id = u.user_id
        LEFT JOIN res_files f ON r.item_id = f.file_id AND r.item_type = 1
        WHERE r.item_type = ? AND r.item_id = ? AND r.status = ?
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `;

      aggregatesQuery = `
        SELECT 
          COUNT(*) AS total_reviews,
          IFNULL(SUM(rating), 0) AS total_star_sum,
          IFNULL(AVG(rating), 0) AS average_rating
        FROM res_reviews
        WHERE item_type = ? AND item_id = ? AND status = ?
      `;

      queryParams = [item_type, item_id, status, parseInt(limit), parseInt(offset)];
      const aggregateParams = [item_type, item_id, status];
    } else {
      // Get all reviews with pagination
      reviewsQuery = `
        SELECT r.*, u.first_name, u.last_name, u.photo, u.email, f.title as file_title
        FROM res_reviews r
        LEFT JOIN res_users u ON r.user_id = u.user_id
        LEFT JOIN res_files f ON r.item_id = f.file_id AND r.item_type = 1
        WHERE r.status = ?
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `;

      aggregatesQuery = `
        SELECT 
          COUNT(*) AS total_reviews,
          IFNULL(SUM(rating), 0) AS total_star_sum,
          IFNULL(AVG(rating), 0) AS average_rating
        FROM res_reviews
        WHERE status = ?
      `;

      queryParams = [status, parseInt(limit), parseInt(offset)];
      const aggregateParams = [status];
    }

    // Run queries in parallel
    const [reviews] = await pool.query(reviewsQuery, queryParams);
    const [[aggregates]] = await pool.query(aggregatesQuery, queryParams.slice(0, -2)); // Remove limit and offset for aggregates

    // Get status distribution for all reviews
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM res_reviews
      GROUP BY status
    `;
    const [statusDistribution] = await pool.query(statusQuery);

    // Get rating distribution
    const ratingQuery = `
      SELECT rating, COUNT(*) as count
      FROM res_reviews
      WHERE status = ?
      GROUP BY rating
      ORDER BY rating DESC
    `;
    const [ratingDistribution] = await pool.query(ratingQuery, [status]);

    return res.status(200).json({
      reviews,
      summary: {
        total_reviews: aggregates.total_reviews,
        total_star_sum: aggregates.total_star_sum,
        average_rating: parseFloat(aggregates.average_rating).toFixed(1),
        text: `${aggregates.total_star_sum} Stars across ${aggregates.total_reviews} Reviews`,
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total_pages: Math.ceil(aggregates.total_reviews / limit)
      },
      distributions: {
        status: statusDistribution,
        ratings: ratingDistribution
      },
      status: "success",
    });
  } catch (err) {
    console.error("Error fetching reviews:", err);
    return res.status(500).json({
      message: "An error occurred while fetching reviews",
      status: "error",
    });
  }
}


module.exports = {
  getFileReviews,
  updateReviewStatus
};
