const { pool } = require("../../config/database");

async function createCourse(req, res) {
  try {
    let {
      title,
      subtitle,
      slug,
      language,
      learning_outcomes,
      description,
      sale_price,
      original_price,
      duration_type = 1,
      duration = 1,
      duration_unit,
      expiry_date = null,
      categories = [],
      newCategories = [],
      tags = [],
      newTags = [],
      media = [],
      status = 2,
    } = req.body;

    // Basic validation for essential fields
    if (!title || !slug || !original_price || !sale_price) {
      return res.status(400).json({
        status: "error",
        message: "Please provide title, slug, original_price and sale_price",
      });
    }

    if (sale_price > original_price) {
      return res.status(400).json({
        status: "error",
        message: "Sale price cannot be greater than original price",
      });
    }

    if (expiry_date && new Date(expiry_date) < new Date()) {
      return res.status(400).json({
        status: "error",
        message: "Expiry date cannot be in the past",
      });
    }

    if (duration_type === 1 && duration < 1) {
      return res.status(400).json({
        status: "error",
        message: "Duration value must be greater than 0",
      });
    }

    if (duration_type === 1 && !duration_unit && !duration) {
      return res.status(400).json({
        status: "error",
        message: "Please provide course duration.",
      });
    }

    if (duration_type === 3 && !expiry_date) {
      return res.status(400).json({
        status: "error",
        message: "Please provide expiry date.",
      });
    }

    // Database validation checks
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      const [titleExists] = await connection.execute(
        `SELECT * FROM res_courses WHERE title = ?`,
        [title]
      );
      if (titleExists.length > 0) {
        return res.status(400).json({
          status: "error",
          message: "Course with this title already exists",
        });
      }

      const [slugExists] = await connection.execute(
        `SELECT * FROM res_courses WHERE slug = ?`,
        [slug]
      );
      if (slugExists.length > 0) {
        return res.status(400).json({
          status: "error",
          message: "Course with this slug already exists",
        });
      }

      sale_price = parseFloat(sale_price);
      original_price = parseFloat(original_price);
      duration_type = parseInt(duration_type);
      duration = duration ?? parseInt(duration);

      // Insert course data into the database
      const [courseResult] = await connection.query(
        `INSERT INTO res_courses 
        (title, subtitle, slug, language, learning_outcomes, description, sale_price, original_price, duration_type, duration, duration_unit, expiry_date, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          subtitle,
          slug,
          language,
          learning_outcomes,
          description,
          sale_price,
          original_price,
          duration_type,
          duration,
          duration_unit,
          expiry_date,
          status,
        ]
      );

      const courseId = courseResult.insertId;

      // Handle categories
      const categoriesIds = [...categories.map((cat) => cat.category_id)];
      for (const categoryName of newCategories) {
        const categorySlug = generateSlug(categoryName);
        const [newCategory] = await connection.execute(
          `INSERT INTO res_course_categories (category_name, slug) VALUES (?, ?)`,
          [categoryName, categorySlug]
        );
        categoriesIds.push(newCategory.insertId);
      }

      if (categoriesIds.length > 0) {
        await Promise.all(
          categoriesIds.map((categoryId) =>
            connection.execute(
              `INSERT INTO res_course_category_relationships (course_id, category_id) VALUES (?, ?)`,
              [courseId, categoryId]
            )
          )
        );
      }

      // Handle tags
      const tagsIds = [...tags.map((tag) => tag.tag_id)];
      for (const tagName of newTags) {
        const tagSlug = generateSlug(tagName);
        const [newTag] = await connection.execute(
          `INSERT INTO res_course_tags (tag_name, slug) VALUES (?, ?)`,
          [tagName, tagSlug]
        );
        tagsIds.push(newTag.insertId);
      }

      if (tagsIds.length > 0) {
        await Promise.all(
          tagsIds.map((tagId) =>
            connection.execute(
              `INSERT INTO res_course_tag_relationship (course_id, tag_id) VALUES (?, ?)`,
              [courseId, tagId]
            )
          )
        );
      }

      // Handle media
      if (media.length > 0) {
        await Promise.all(
          media.map((mediaItem) =>
            connection.execute(
              `INSERT INTO res_course_media (course_id, type, file_name, is_cover) VALUES (?, ?, ?, ?)`,
              [courseId, mediaItem.type, mediaItem.file_name, mediaItem.is_cover]
            )
          )
        );
      }

      await connection.commit();
      res.status(201).json({
        status: "success",
        message: "Course created successfully",
        data: { courseId, title, categories: categoriesIds, tags: tagsIds },
      });

    } catch (error) {
      await connection.rollback();
      console.error("Error while inserting data: ", error);
      res.status(400).json({
        status: "error",
        message: error.message || "An error occurred while processing your request.",
      });
    }
  } catch (error) {
    console.error("General error: ", error);
    res.status(400).json({
      status: "error",
      message: error.message || "Invalid input",
    });
  }
}

async function getCourseList(req, res) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;
    const categorySlug = req.query.category || null; // Default to null if not provided
    console.log(categorySlug);

    let categoryId = null;

    // Resolve category_id if categorySlug is provided
    if (categorySlug) {
      const [categoryResult] = await pool.execute(
        `SELECT category_id FROM res_course_categories WHERE slug = ?`,
        [categorySlug]
      );

      if (categoryResult.length === 0) {
        return res.status(404).json({ error: "Invalid category" });
      }

      categoryId = categoryResult[0].category_id;
    }

    // Base query
    let baseQuery = `SELECT p.* FROM res_courses p`;
    let whereClause = "";
    const queryParams = [limit, offset];

    if (categoryId) {
      baseQuery += ` 
        JOIN res_course_category_relationships pcr ON p.course_id = pcr.course_id
      `;
      whereClause = `WHERE pcr.category_id = ?`;
      queryParams.unshift(categoryId); // Add category_id to query params
    }

    baseQuery += ` ${whereClause} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;

    // Fetch course details
    const [courses] = await pool.execute(baseQuery, queryParams);

    if (courses.length === 0) {
      return res.status(404).json({ error: "No courses found" });
    }

    // Get total course count
    let countQuery = `SELECT COUNT(*) AS total FROM res_courses p`;
    if (categoryId) {
      countQuery += `
        JOIN res_course_category_relationships pcr ON p.course_id = pcr.course_id
        WHERE pcr.category_id = ?`;
    }

    const [[{ total }]] = await pool.execute(
      countQuery,
      categoryId ? [categoryId] : []
    );

    // Fetch associated media
    const courseIds = courses.map((course) => course.course_id);

    const [media] = await pool.execute(
      `SELECT media_id, course_id, type, file_name, is_cover 
      FROM res_course_media 
      WHERE course_id IN (${courseIds.join(",")}) AND is_cover = 1`
    );

    // Fetch associated categories
    const [categories] = await pool.execute(
      `SELECT c.category_id, c.category_name, pcr.course_id 
      FROM res_course_categories c
      JOIN res_course_category_relationships pcr ON c.category_id = pcr.category_id
      WHERE pcr.course_id IN (${courseIds.join(",")})`
    );

    // Organize media and categories by course ID
    const mediaMap = media.reduce((acc, item) => {
      if (!acc[item.course_id]) {
        acc[item.course_id] = [];
      }
      acc[item.course_id].push(item);
      return acc;
    }, {});

    const categoryMap = categories.reduce((acc, item) => {
      if (!acc[item.course_id]) {
        acc[item.course_id] = [];
      }
      acc[item.course_id].push(item);
      return acc;
    }, {});

    // Structure course data
    const courseList = courses.map((course) => ({
      ...course,
      media: mediaMap[course.course_id] || [],
      categories: categoryMap[course.course_id] || [],
    }));

    // Final response
    return res.status(200).json({
      status: "success",
      data: courseList,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error("Error fetching course list:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCourseDetails(req, res) {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      res.status(400).json({ error: "Course ID is required" });
    }

    const [course] = await pool.execute(
      `SELECT * FROM res_courses WHERE course_id = ?`,
      [courseId]
    );

    const courseDetails = course[0];
    console.log(courseDetails)

    if (course.length === 0) {
      return res.status(404).json({ error: "Course not found" });
    }


    // Fetch associated media
    const [media] = await pool.execute(
      `SELECT media_id, course_id, type, file_name, is_cover 
      FROM res_course_media 
      WHERE course_id = ? AND is_cover = 1`,
      [courseId]
    );

    // Fetch associated categories
    const [categories] = await pool.execute(
      `SELECT c.category_id, c.category_name 
      FROM res_course_categories c
      JOIN res_course_category_relationships pcr ON c.category_id = pcr.category_id
      WHERE pcr.course_id = ?`,
      [courseId]
    );

    // Structure the course data response
    const response = {
      ...courseDetails,
      media: media || [],
      categories: categories || [],
    };

    return res.status(200).json({
      status: "success",
      data: response,
    });
  } catch (error) {
    console.error("Error fetching course details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function deleteCourse(req, res) {
  const { courseId } = req.params;

  if (!courseId) {
    return res
      .status(400)
      .json({ status: "error", message: "Course ID is required" });
  }

  try {
    const [courseResult] = await pool.execute(
      `DELETE FROM res_courses WHERE course_id = ?`,
      [courseId]
    );

    if (courseResult.affectedRows === 0) {
      return res
        .status(404)
        .json({ status: "error", message: "Course not found" });
    }

    return res.status(200).json({
      status: "success",
      message: "Course deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting course:", error);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

async function updateCourse(req, res) {
  const { courseId } = req.params;

  console.log(req.body);
  console.log(courseId);

  const {
    title,
    subtitle,
    language,
    slug,
    learning_outcomes,
    description,
    sale_price,
    original_price,
    duration_type,
    duration,
    expiry_date,
    categories = [],
    newCategories = [],
    tags = [],
    newTags = [],
    media = [],
  } = req.body;

  if (!courseId) {
    return res
      .status(400)
      .json({ status: "error", message: "Course ID is required" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    
    // Update course data
    await connection.execute(
      `UPDATE res_courses 
      SET title = ?, subtitle = ?, language = ?, slug = ?, learning_outcomes = ?, description = ?, sale_price = ?, 
      original_price = ?, duration_type = ?, duration = ?, expiry_date = ? 
      WHERE course_id = ?`,
      [
        title,
        subtitle,
        language,
        slug,
        learning_outcomes,
        description,
        sale_price,
        original_price,
        duration_type,
        duration,
        expiry_date,
        courseId,
      ]
    );

    // Delete existing category relationships
    await connection.execute(
      `DELETE FROM res_course_category_relationships WHERE course_id = ?`,
      [courseId]
    );

    // Add categories
    const existingCategories = categories.map((cat) => cat.category_id);
    const categoriesIds = [...existingCategories];

    for (const categoryName of newCategories) {
      const slug = generateSlug(categoryName);
      const [insertedCategory] = await connection.execute(
        `INSERT INTO res_course_categories (category_name, slug) VALUES (?, ?)`,
        [categoryName, slug]
      );
      categoriesIds.push(insertedCategory.insertId);
    }

    if (categoriesIds.length > 0) {
      const categoryQueries = categoriesIds.map((categoryId) =>
        connection.execute(
          `INSERT INTO res_course_category_relationships (course_id, category_id) VALUES (?, ?)`,
          [courseId, categoryId]
        )
      );
      await Promise.all(categoryQueries);
    }

    // Delete existing tag relationships
    await connection.execute(
      `DELETE FROM res_course_tag_relationship WHERE course_id = ?`,
      [courseId]
    );

    // Add tags
    const existingTags = tags.map((tag) => tag.tag_id);
    const tagsIds = [...existingTags];

    for (const tagName of newTags) {
      const slug = generateSlug(tagName);
      const [insertedTag] = await connection.execute(
        `INSERT INTO res_course_tags (tag_name, slug) VALUES (?, ?)`,
        [tagName, slug]
      );
      tagsIds.push(insertedTag.insertId);
    }

    if (tagsIds.length > 0) {
      const tagQueries = tagsIds.map((tagId) =>
        connection.execute(
          `INSERT INTO res_course_tag_relationship (course_id, tag_id) VALUES (?, ?)`,
          [courseId, tagId]
        )
      );
      await Promise.all(tagQueries);
    }

    // Delete existing media
    await connection.execute(
      `DELETE FROM res_course_media WHERE course_id = ?`,
      [courseId]
    );

    // Add media
    if (media.length > 0) {
      const mediaQueries = media.map((mediaItem) =>
        connection.execute(
          `INSERT INTO res_course_media (course_id, type, file_name, is_cover) VALUES (?, ?, ?, ?)`,
          [courseId, mediaItem.type, mediaItem.file_name, mediaItem.is_cover]
        )
      );
      await Promise.all(mediaQueries);
    }

    // Commit transaction
    await connection.commit();
    res
      .status(200)
      .json({ status: "success", message: "Course updated successfully" });
  } catch (error) {
    console.error(error);
    await connection.rollback();
    res.status(500).json({
      status: "error",
      message: "Failed to update course",
      error: error.message,
    });
  } finally {
    connection.release();
  }
}

const generateSlug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric characters with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens

module.exports = {
  createCourse,
  getCourseList,
  getCourseDetails,
  deleteCourse,
  updateCourse,
};
