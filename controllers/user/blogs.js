const { pool } = require("../../config/database");

async function getAllBlogs(req, res) {
  const connection = await pool.getConnection();
  try {
      let {
          page = 1,
          limit = 8,
          search = "",
          status = "published" // Default to 'published'
      } = req.query;

      page = parseInt(page);
      limit = parseInt(limit);
      const offset = (page - 1) * limit;

      let searchClause = "";
      let values = [];

      if (search) {
          searchClause += `AND (b.title LIKE ? OR b.content LIKE ? OR b.author LIKE ?) `;
          const likeSearch = `%${search}%`;
          values.push(likeSearch, likeSearch, likeSearch);
      }

      if (status) {
          searchClause += `AND b.status = ? `;
          values.push(status);
      }

      const blogQuery = `
          SELECT 
              b.blog_id,
              b.title,
              b.slug,
              b.excerpt,
              b.author,
              b.featured_image,
              b.created_at,
              ta.tags,
              ca.categories
          FROM res_blogs b
          LEFT JOIN (
              SELECT bt.blog_id, GROUP_CONCAT(DISTINCT t.name) AS tags
              FROM res_blogs_tags_relationship bt
              JOIN res_blogs_tags t ON bt.tag_id = t.tag_id
              GROUP BY bt.blog_id
          ) ta ON ta.blog_id = b.blog_id
          LEFT JOIN (
              SELECT br.blog_id, GROUP_CONCAT(DISTINCT c.name) AS categories
              FROM res_blogs_categories_relationship br
              JOIN res_blogs_categories c ON br.category_id = c.category_id
              GROUP BY br.blog_id
          ) ca ON ca.blog_id = b.blog_id
          WHERE 1=1 ${searchClause}
          ORDER BY b.created_at DESC
          LIMIT ? OFFSET ?
      `;

      values.push(limit, offset);

      const [rows] = await connection.query(blogQuery, values);

      const formattedBlogs = rows.map(r => ({
          blog_id: r.blog_id,
          title: r.title,
          slug: r.slug,
          excerpt: r.excerpt,
          author: r.author,
          featured_image: r.featured_image,
          created_at: r.created_at,
          tags: r.tags ? String(r.tags).split(',') : [],
          categories: r.categories ? String(r.categories).split(',') : [],
      }));

      // Count total blogs for pagination
      const countQuery = `
          SELECT COUNT(DISTINCT b.blog_id) AS total
          FROM res_blogs b
          WHERE 1=1 ${search ? "AND (b.title LIKE ? OR b.content LIKE ? OR b.author LIKE ?)" : ""} ${status ? "AND b.status = ?" : ""}
      `;

      const countValues = [];
      if (search) {
          const likeSearch = `%${search}%`;
          countValues.push(likeSearch, likeSearch, likeSearch);
      }
      if (status) {
          countValues.push(status);
      }

      const [[{ total }]] = await connection.query(countQuery, countValues);

      const result = {
          data: formattedBlogs,
          totalCount: total,
          totalPages: Math.ceil(total / limit),
          limit,
          page,
      };

      res.status(200).json({
          message: "Blogs retrieved successfully",
          status: "success",
          response: result
      });
  } catch (err) {
//       // console.error(err);
      res.status(500).json({ message: "Internal server error", status: "error" });
  } finally {
      connection.release();
  }
}

// Get a blog by ID

async function getBlogBySlug(req, res) {
  const connection = await pool.getConnection();
  try {
      const { slug } = req.params;

      if (!slug) {
          return res.status(400).json({ message: "Blog slug is required", status: "error" });
      }
// get blog id by slug

      const [[blogId]] = await connection.query(
          `SELECT blog_id FROM res_blogs WHERE slug = ?`,
          [slug]
      );

      if (!blogId) {
          return res.status(404).json({ message: "Blog not found", status: "error" });
      } 

      const { blog_id: id } = blogId;
      // Get blog details

      const query = `
          SELECT 
              b.blog_id,
              b.title,
              b.slug,
              b.excerpt,
              b.author,
              b.status,
              b.featured_image,
              b.gallery,
              b.content,
              b.created_at,
              GROUP_CONCAT(DISTINCT t.name) AS tags,
              GROUP_CONCAT(DISTINCT c.name) AS categories
          FROM res_blogs b
          LEFT JOIN res_blogs_tags_relationship bt ON bt.blog_id = b.blog_id
          LEFT JOIN res_blogs_tags t ON bt.tag_id = t.tag_id
          LEFT JOIN res_blogs_categories_relationship br ON br.blog_id = b.blog_id
          LEFT JOIN res_blogs_categories c ON br.category_id = c.category_id
          WHERE b.blog_id = ?
          GROUP BY b.blog_id
      `;

      const [blogs] = await connection.query(query, [id]);

      if (blogs.length === 0) {
          return res.status(404).json({ message: "Blog not found", status: "error" });
      }

      const blog = blogs[0];

      blog.tags = blog.tags ? blog.tags.split(',') : [];
      blog.categories = blog.categories ? blog.categories.split(',') : [];
      try {
          blog.gallery = blog.gallery ? JSON.parse(blog.gallery) : [];
      } catch (parseError) {
//           // console.error("Error parsing gallery JSON:", parseError);
          blog.gallery = [];
      }

      res.status(200).json({
          message: "Blog retrieved successfully",
          status: "success",
          response: blog
      });
  } catch (err) {
//       // console.error(err);
      res.status(500).json({ message: "Internal server error", status: "error" });
  } finally {
      connection.release();
  }
}

// Get featured blogs
async function getFeaturedBlog(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT 
        b.blog_id,
        b.title,
        b.slug,
        b.author,
        b.excerpt,
          b.likes,
        b.featured_image,
        GROUP_CONCAT(DISTINCT c.name) AS categories
      FROM res_blogs b
      LEFT JOIN res_blogs_categories_relationship bc ON b.blog_id = bc.blog_id
      LEFT JOIN res_blogs_categories c ON bc.category_id = c.category_id
      WHERE b.featured = 1
      GROUP BY b.blog_id
    `);

    // Directly format the results into the desired structure
    const blogs = rows.map(({ categories, ...blog }) => ({
      ...blog,
//       categories: categories ? categories.split(",") : [], // Convert categories string to array
    }));

    res.status(200).json({
//       data: blogs,
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

async function getRecentBlogs(req, res) {
  const { limit = 8 } = req.query;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        b.blog_id,
        b.title,
        b.slug,
        b.author,
        b.excerpt,
        b.likes,
        b.featured_image,
        b.created_at,
        GROUP_CONCAT(DISTINCT c.name) AS categories
      FROM res_blogs b
      LEFT JOIN res_blogs_categories_relationship bc ON b.blog_id = bc.blog_id
      LEFT JOIN res_blogs_categories c ON bc.category_id = c.category_id
      WHERE b.status = 'published'
      GROUP BY b.blog_id
      ORDER BY b.created_at DESC
      LIMIT ?
    `,
      [limit]
    );

    const blogs = rows.map(({ categories, ...blog }) => ({
      ...blog,
      categories: categories ? String(categories).split(",") : [],
    }));

    res.status(200).json({
      status: "success",
      response: { data: blogs },
    });
  } catch (err) {
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}


async function getBlogTags(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT tag_id, name
      FROM res_blogs_tags
    `);

    res.status(200).json({
//       data: rows,
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

async function getBlogCategories(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT category_id, name
      FROM res_blogs_categories
      ORDER BY name ASC
    `);

    const categories = rows.map(r => ({ id: r.category_id, name: r.name }));

    res.status(200).json({
      status: "success",
      response: categories,
    });
  } catch (err) {
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

async function getBlogByTag(req, res) {
  const { tag } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        b.blog_id,
        b.title,
        b.slug,
        b.author,
        b.excerpt,
        b.featured_image,
        b.created_at,
        GROUP_CONCAT(DISTINCT c.name) AS categories
      FROM res_blogs b
      LEFT JOIN res_blogs_categories_relationship bc ON b.blog_id = bc.blog_id
      LEFT JOIN res_blogs_categories c ON bc.category_id = c.category_id
      LEFT JOIN res_blogs_tags_relationship bt ON b.blog_id = bt.blog_id
      LEFT JOIN res_blogs_tags t ON bt.tag_id = t.tag_id
      WHERE t.name = ?
      GROUP BY b.blog_id
    `,
      [tag]
    );

    // Directly format the results into the desired structure
    const blogs = rows.map(({ categories, ...blog }) => ({
      ...blog,
//       categories: categories ? categories.split(",") : [], // Convert categories string to array
    }));

    res.status(200).json({
//       data: blogs,
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

async function getBlogByCategory(req, res) {
  const { category } = req.params;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        b.blog_id,
        b.title,
        b.slug,
        b.author,
        b.excerpt,
        b.featured_image,
        b.created_at,
        GROUP_CONCAT(DISTINCT c.name) AS categories
      FROM res_blogs b
      LEFT JOIN res_blogs_categories_relationship bc ON b.blog_id = bc.blog_id
      LEFT JOIN res_blogs_categories c ON bc.category_id = c.category_id
      WHERE c.name = ?
      GROUP BY b.blog_id
    `,
      [category]
    );

    // Format the results into expected structure
    const blogs = rows.map(({ categories, ...blog }) => ({
      ...blog,
      categories: categories ? String(categories).split(',') : [],
    }));

    res.status(200).json({
      status: "success",
      response: { data: blogs },
    });
  } catch (err) {
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

// get top blogs by views

async function getTopBlogsByViews(req, res) {
  const { limit = 3 } = req.query;

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        b.blog_id,
        b.title,
        b.slug,
        b.author,
        b.excerpt,
        b.featured_image,
        b.created_at,
        GROUP_CONCAT(DISTINCT c.name) AS categories
      FROM res_blogs b
      LEFT JOIN res_blogs_categories_relationship bc ON b.blog_id = bc.blog_id
      LEFT JOIN res_blogs_categories c ON bc.category_id = c.category_id
      WHERE b.status = 'published'
      GROUP BY b.blog_id
      ORDER BY b.views DESC
      LIMIT ?
    `,
      [limit]
    );

    // Directly format the results into the desired structure
    const blogs = rows.map(({ categories, ...blog }) => ({
      ...blog,
//       categories: categories ? categories.split(",") : [], // Convert categories string to array
    }));

    res.status(200).json({
//       data: blogs,
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

async function searchBlogs(req, res) {
  const { query } = req.query;

  // Check if the query parameter is provided
  if (!query) {
    return res.status(400).json({
      message: "Query parameter is required",
      status: "error",
    });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT 
        b.blog_id,
        b.title,
        b.slug,
        b.author,
        b.excerpt,
        b.featured_image,
        b.created_at,
        GROUP_CONCAT(DISTINCT c.name) AS categories
      FROM res_blogs b
      LEFT JOIN res_blogs_categories_relationship bc ON b.blog_id = bc.blog_id
      LEFT JOIN res_blogs_categories c ON bc.category_id = c.category_id
      WHERE b.title LIKE ? OR b.author LIKE ? OR b.excerpt LIKE ?
      GROUP BY b.blog_id
    `,
      [`%${query}%`, `%${query}%`, `%${query}%`]
    );

    // Format the results into expected structure
    const blogs = rows.map(({ categories, ...blog }) => ({
      ...blog,
      categories: categories ? String(categories).split(",") : [],
    }));

    res.status(200).json({
      status: "success",
      response: { data: blogs },
    });
  } catch (err) {
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

async function likeBlog(req, res) {
  const { blog_id } = req.body;

  try {
    const [rows] = await pool.query(
      `
      UPDATE res_blogs
      SET likes = likes + 1
      WHERE blog_id = ?
    `,
      [blog_id]
    );

    res.status(200).json({
//       message: "Blog liked successfully",
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

async function unlikeBlog(req, res) {
  const { blog_id } = req.body;

  try {
    const [rows] = await pool.query(
      `
      UPDATE res_blogs
      SET likes = likes - 1
      WHERE blog_id = ?
    `,
      [blog_id]
    );

    res.status(200).json({
//       message: "Blog unliked successfully",
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

async function commentOnBlog(req, res) {
  const { blog_id, user_id, comment } = req.body;

  try {
    const [rows] = await pool.query(
      `
      INSERT INTO res_blog_comments (blog_id, user_id, comment)
      VALUES (?, ?, ?)
    `,
      [blog_id, user_id, comment]
    );

    res.status(200).json({
//       message: "Comment added successfully",
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

async function replyToComment(req, res) {
  const { comment_id, user_id, reply } = req.body;

  try {
    const [rows] = await pool.query(
      `
      INSERT INTO res_blog_comment_replies (comment_id, user_id, reply)
      VALUES (?, ?, ?)
    `,
      [comment_id, user_id, reply]
    );

    res.status(200).json({
//       message: "Reply added successfully",
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}

// get blog comments with reply, user details
async function getBlogComments(req, res) {
  const { id } = req.body;

  try {
    if (!id) {
      return res.status(400).json({
//         message: "Blog id is required",
//         status: "error",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT 
        bc.comment_id,
        bc.comment,
        bc.created_at,
        u.first_name,
        u.last_name,
        u.photo as avatar,
        GROUP_CONCAT(DISTINCT bcr.reply) AS replies
      FROM res_blog_comments bc
      LEFT JOIN res_users u ON bc.user_id = u.user_id
      LEFT JOIN res_blog_comment_replies bcr ON bc.comment_id = bcr.comment_id
      WHERE bc.blog_id = ?
      GROUP BY bc.comment_id
      ORDER BY bc.created_at DESC
    `,
      [id]
    );

    // Directly format the results into the desired structure
    const comments = rows.map(({ replies, ...comment }) => ({
      ...comment,
//       replies: replies ? replies.split(",") : [], // Convert replies string to array
    }));

    res.status(200).json({
//       data: comments,
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  }
}


async function getRelatedBlogs(req, res) {
  const connection = await pool.getConnection();
  try {

    const blogId = req.body.id;

    // Step 2: Get category IDs of the current blog
    const [categoryRows] = await connection.query(
      `SELECT category_id FROM res_blogs_categories_relationship WHERE blog_id = ?`,
      [blogId]
    );

    if (categoryRows.length === 0) {
      return res.status(200).json({
//         data: [],
//         status: "success",
//         message: "No related blogs (no categories found for this blog).",
      });
    }

    const categoryIds = categoryRows.map(row => row.category_id);

    // Step 3: Find related blogs that share categories, excluding the current blog
    const [relatedBlogs] = await connection.query(
      `
      SELECT 
        b.blog_id,
        b.title,
        b.slug,
        b.author,
        b.excerpt,
        b.featured_image,
        b.created_at,
        GROUP_CONCAT(DISTINCT c.name) AS categories
      FROM res_blogs b
      INNER JOIN res_blogs_categories_relationship br ON br.blog_id = b.blog_id
      INNER JOIN res_blogs_categories c ON br.category_id = c.id
      WHERE br.category_id IN (?)
        AND b.blog_id != ?
      GROUP BY b.blog_id
      ORDER BY b.created_at DESC
      LIMIT 4
      `,
      [categoryIds, blogId]
    );

    // Format categories to arrays
    const formatted = relatedBlogs.map(({ categories, ...blog }) => ({
      ...blog,
//       categories: categories ? categories.split(",") : [],
    }));

    res.status(200).json({
//       data: formatted,
//       status: "success",
    });
  } catch (err) {
//     // console.error(err);
    res.status(500).json({
//       message: "Internal server error",
//       status: "error",
    });
  } finally {
    connection.release();
  }
}


module.exports = {
  getAllBlogs,
  getBlogBySlug,
  getFeaturedBlog,
  getRecentBlogs,
  getBlogTags,
  getBlogCategories,
  getBlogByTag,
  getBlogByCategory,
  getTopBlogsByViews,
  searchBlogs,
  likeBlog,
  unlikeBlog,
  commentOnBlog,
  replyToComment,
  getBlogComments,
  getRelatedBlogs,
};
