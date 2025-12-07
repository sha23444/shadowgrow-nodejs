const { pool } = require("../../../config/database");
const { clearBlogCache } = require("../../../config/smart-cache");

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

function toSlug(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function isSlugTaken(connection, slug, excludeId = null) {
  const params = [slug];
  let query = `SELECT blog_id FROM res_blogs WHERE slug = ?`;
  if (excludeId) {
    query += ` AND blog_id <> ?`;
    params.push(excludeId);
  }
  const [rows] = await connection.query(query, params);
  return rows.length > 0;
}

// Create a new blog post with unique title/slug validation

async function createBlog(req, res) {
    const connection = await pool.getConnection();
    try {
        let {
            title,
            content,
            author,
            slug,
            categories = [],   // Categories as an array
            tags = [],         // Tags as an array
            excerpt,
            featured_image,
            gallery = [],       // Gallery as an array
            status = 'published',
        } = req.body;

        // Basic validation
        if (!title || !content) {
          return res.status(400).json({ status: 'error', message: 'Title and content are required' });
        }

        // Normalize slug
        const finalSlug = toSlug(slug || title);

        // Begin transaction
        await connection.beginTransaction();

        // Uniqueness checks
        if (await isSlugTaken(connection, finalSlug)) {
          await connection.rollback();
          return res.status(409).json({ status: 'error', message: 'Slug already exists' });
        }
        const [dupTitle] = await connection.query(`SELECT blog_id FROM res_blogs WHERE title = ?`, [title]);
        if (dupTitle.length > 0) {
          await connection.rollback();
          return res.status(409).json({ status: 'error', message: 'Title already exists' });
        }

        // Insert blog
        const query = `
            INSERT INTO res_blogs (title, content, author, slug, excerpt, featured_image, gallery, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        // Convert gallery array to JSON string
        const galleryJson = JSON.stringify(gallery);

        const [result] = await connection.query(query, [
            title, content, author || 'Admin', finalSlug, excerpt || null, featured_image || null, galleryJson, status
        ]);

        const blogId = result.insertId;
        
        // === TAG HANDLING (blogs tags) ===
        if (Array.isArray(tags) && tags.length > 0) {
          const [[{ maxId = 0 } = {}]] = await connection.query(
            `SELECT COALESCE(MAX(id),0) AS maxId FROM res_blogs_tags_relationship`
          );
          let nextId = Number(maxId) || 0;
          for (const name of tags) {
            // upsert tag by name in res_blogs_tags
            const [existing] = await connection.query(
              `SELECT tag_id FROM res_blogs_tags WHERE name = ?`,
              [name]
            );
            const tagId = existing.length
              ? existing[0].tag_id
              : (await connection.query(
                  `INSERT INTO res_blogs_tags (name) VALUES (?)`,
                  [name]
                ))[0].insertId;
            // map to relationship with explicit id
            await connection.query(
              `INSERT INTO res_blogs_tags_relationship (id, blog_id, tag_id) VALUES (?, ?, ?)`,
              [++nextId, blogId, tagId]
            );
          }
        }

        // Insert categories for the blog if provided
        if (categories.length > 0) {
          const [[{ maxId = 0 } = {}]] = await connection.query(
            `SELECT COALESCE(MAX(id),0) AS maxId FROM res_blogs_categories_relationship`
          );
          let nextId = Number(maxId) || 0;
          const categoryData = categories.map(categoryId => [
            ++nextId,
            blogId,
            categoryId,
          ]);
          await connection.query(
            `INSERT INTO res_blogs_categories_relationship (id, blog_id, category_id) VALUES ?`,
            [categoryData]
          );
        }

        // Commit transaction
        await connection.commit();
        
        // Clear blog cache after creating new blog
        await clearBlogCache();

        res.status(201).json({
          status: "success",
          message: "Blog created successfully",
          response: {
            blog_id: blogId,
            preview_url: `${APP_URL}/blogs/${finalSlug}`
          }
        });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    } finally {
        connection.release();
    }
}


async function getAllBlogs(req, res) {
    const connection = await pool.getConnection();
    try {
        let {
            page = 1,
            limit = 10,
            search = "",
            status
        } = req.query;

        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        let searchClause = "";
        let values = [];

        if (search) {
            searchClause += `AND (b.title LIKE ? OR b.slug LIKE ? OR b.author LIKE ?)`;
            const likeSearch = `%${search}%`;
            values.push(likeSearch, likeSearch, likeSearch);
        }

        if (status) {
            searchClause += ` AND b.status = ?`;
            values.push(status);
        }

        // Avoid ONLY_FULL_GROUP_BY issues by joining pre-aggregated tables
        const blogQuery = `
            SELECT 
                b.blog_id,
                b.title,
                b.slug,
                b.excerpt,
                b.author,
                b.status,
                b.featured_image,
                b.gallery,
                b.created_at,
                ta.tags,
                ca.categories
            FROM res_blogs b
            LEFT JOIN (
              SELECT tm.ref_id AS blog_id, GROUP_CONCAT(DISTINCT t.tag) AS tags
              FROM tag_map tm
              JOIN tags t ON tm.tag_id = t.id
              WHERE tm.ref_type = 'blog'
              GROUP BY tm.ref_id
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
        const [blogs] = await connection.query(blogQuery, values);

        const formattedBlogs = blogs.map(blog => {
            let galleryArr = [];
            if (blog.gallery) {
                try {
                    const parsed = JSON.parse(blog.gallery);
                    galleryArr = Array.isArray(parsed) ? parsed : [];
                } catch {
                    galleryArr = [];
                }
            }
            return {
                ...blog,
                tags: blog.tags ? String(blog.tags).split(',') : [],
                categories: blog.categories ? String(blog.categories).split(',') : [],
                gallery: galleryArr,
                preview_url: `${APP_URL}/blogs/${blog.slug}`,
            };
        });

        // Count total blogs for pagination
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM res_blogs b
            WHERE 1=1 ${search ? "AND (b.title LIKE ? OR b.slug LIKE ? OR b.author LIKE ?)" : ""} ${status ? "AND b.status = ?" : ""}
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
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error", error: err.message });
    } finally {
        connection.release();
    }
}

// Get a blog by ID

async function getBlogById(req, res) {
    const connection = await pool.getConnection();
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                b.blog_id,
                b.title,
                b.content,
                b.slug,
                b.excerpt,
                b.author,
                b.status,
                b.featured_image,
                b.gallery,
                b.created_at,
                GROUP_CONCAT(DISTINCT t.name) AS tags,
                GROUP_CONCAT(DISTINCT c.name) AS categories,
                GROUP_CONCAT(DISTINCT br.category_id) AS category_ids,
                GROUP_CONCAT(DISTINCT bt.tag_id) AS tag_ids
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
        blog.category_ids = blog.category_ids
          ? blog.category_ids.split(',').map(v => Number(v)).filter(v => !Number.isNaN(v))
          : [];
        blog.tag_ids = blog.tag_ids
          ? blog.tag_ids.split(',').map(v => Number(v)).filter(v => !Number.isNaN(v))
          : [];
        blog.gallery = blog.gallery ? JSON.parse(blog.gallery) : [];
        blog.preview_url = `${APP_URL}/blogs/${blog.slug}`;

        res.status(200).json({
            message: "Blog retrieved successfully",
            status: "success",
            response: blog
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    } finally {
        connection.release();
    }
}

// Delete a blog
async function deleteBlog(req, res) {
    try {
        const { id } = req.params;

        const query = `DELETE FROM res_blogs WHERE blog_id = ?`;
        await pool.query(query, [id]);
        
        // Clear blog cache after deletion
        await clearBlogCache(id);

        res.status(200).json({ message: "Blog deleted successfully", status: "success" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Internal server error", status: "error" });
    }
}

// Update a blog (title/slug validations, categories/tags sync)
async function updateBlog(req, res) {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    let {
      title,
      content,
      author,
      slug,
      categories = [],
      tags = [],
      excerpt,
      featured_image,
      gallery = [],
      status,
    } = req.body;

    const [[exists]] = await connection.query(`SELECT blog_id, slug FROM res_blogs WHERE blog_id = ?`, [id]);
    if (!exists) {
      return res.status(404).json({ status: 'error', message: 'Blog not found' });
    }

    await connection.beginTransaction();

    const finalSlug = toSlug(slug || title || exists.slug);
    if (await isSlugTaken(connection, finalSlug, id)) {
      await connection.rollback();
      return res.status(409).json({ status: 'error', message: 'Slug already exists' });
    }
    if (title) {
      const [dupTitle] = await connection.query(`SELECT blog_id FROM res_blogs WHERE title = ? AND blog_id <> ?`, [title, id]);
      if (dupTitle.length > 0) {
        await connection.rollback();
        return res.status(409).json({ status: 'error', message: 'Title already exists' });
      }
    }

    const galleryJson = JSON.stringify(gallery || []);
    await connection.query(
      `UPDATE res_blogs SET 
        title = COALESCE(?, title),
        content = COALESCE(?, content),
        author = COALESCE(?, author),
        slug = ?,
        excerpt = COALESCE(?, excerpt),
        featured_image = COALESCE(?, featured_image),
        gallery = ?,
        status = COALESCE(?, status)
       WHERE blog_id = ?`,
      [
        title || null,
        content || null,
        author || null,
        finalSlug,
        excerpt || null,
        featured_image || null,
        galleryJson,
        status || null,
        id,
      ]
    );

    // Sync tags (blogs tags)
    await connection.query(
      `DELETE FROM res_blogs_tags_relationship WHERE blog_id = ?`,
      [id]
    );
    if (Array.isArray(tags)) {
      const [[{ maxId = 0 } = {}]] = await connection.query(
        `SELECT COALESCE(MAX(id),0) AS maxId FROM res_blogs_tags_relationship`
      );
      let nextId = Number(maxId) || 0;
      for (const name of tags) {
        const [existing] = await connection.query(
          `SELECT tag_id FROM res_blogs_tags WHERE name = ?`,
          [name]
        );
        const tagId = existing.length
          ? existing[0].tag_id
          : (await connection.query(
              `INSERT INTO res_blogs_tags (name) VALUES (?)`,
              [name]
            ))[0].insertId;
        await connection.query(
          `INSERT INTO res_blogs_tags_relationship (id, blog_id, tag_id) VALUES (?, ?, ?)`,
          [++nextId, id, tagId]
        );
      }
    }

    // Sync categories
    await connection.query(`DELETE FROM res_blogs_categories_relationship WHERE blog_id = ?`, [id]);
    if (Array.isArray(categories) && categories.length > 0) {
      const [[{ maxId = 0 } = {}]] = await connection.query(
        `SELECT COALESCE(MAX(id),0) AS maxId FROM res_blogs_categories_relationship`
      );
      let nextId = Number(maxId) || 0;
      const categoryData = categories.map(categoryId => [
        ++nextId,
        id,
        categoryId,
      ]);
      await connection.query(
        `INSERT INTO res_blogs_categories_relationship (id, blog_id, category_id) VALUES ?`,
        [categoryData]
      );
    }

    await connection.commit();
    
    // Clear blog cache after update
    await clearBlogCache(id);
    
    res.status(200).json({
      status: 'success',
      message: 'Blog updated',
      response: { blog_id: Number(id), preview_url: `${APP_URL}/blogs/${finalSlug}` },
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Internal server error', error: err.message });
  } finally {
    connection.release();
  }
}

// Publish/unpublish toggle
async function updateBlogStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['published', 'draft'].includes(status)) {
      return res.status(400).json({ status: 'error', message: 'Invalid status. Use published|draft' });
    }
    const [result] = await pool.query(
      `UPDATE res_blogs SET status = ? WHERE blog_id = ?`,
      [status, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ status: 'error', message: 'Blog not found' });
    }
    const [[{ slug } = {}]] = await pool.query(`SELECT slug FROM res_blogs WHERE blog_id = ?`, [id]);
    
    // Clear blog cache after status update
    await clearBlogCache(id);
    
    res.status(200).json({
      status: 'success',
      message: 'Status updated',
      response: { blog_id: Number(id), status, preview_url: slug ? `${APP_URL}/blogs/${slug}` : null },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}

module.exports = { createBlog, getAllBlogs, deleteBlog, getBlogById, updateBlog, updateBlogStatus };
