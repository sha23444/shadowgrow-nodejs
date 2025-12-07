const { pool } = require("../../config/database");
const bcrypt = require("bcryptjs");

async function checkEmailOrUsername(req, res) {
  const { username, email } = req.body;

  try {
    if (username) {
      const [existingUser] = await pool.execute(
        "SELECT * FROM res_users WHERE username = ?",
        [username]
      );
      if (existingUser.length > 0) {
        return res.status(409).json({
          exists: true,
          message: "Username is already taken",
        });
      } else {
        return res.status(200).json({
          exists: false,
          message: "Username is available",
        });
      }
    }

    if (email) {
      const [existingUser] = await pool.execute(
        "SELECT * FROM res_users WHERE email = ?",
        [email]
      );
      if (existingUser.length > 0) {
        return res.status(409).json({
          exists: true,
          message: "Email is already taken",
        });
      } else {
        return res.status(200).json({
          exists: false,
          message: "Email is available",
        });
      }
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function addNewUser(req, res) {
  const {
    password,
    email,
    dial_code = null,
    phone,
    role_id = null,
    first_name = null,
    last_name = null,
    user_type = 1,
    country_code = null
  } = req.body;

  // Check for missing required fields

  if (!password || !email) {
    return res.status(400).json({ error: "Please fill all required fields." });
  }

  try {
    // Check if username already exists

    const [existingUser] = await pool.execute(
      "SELECT * FROM res_users WHERE email = ?",
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        message: "Email already exists, please try another email",
      });
    }

    let username = email.split("@")[0];

    // Check if email already exists
    const [existingUsername] = await pool.execute(
      "SELECT * FROM res_users WHERE username = ?",
      [username]
    );

    if (existingUsername.length > 0) {
      // generate username random
      username = username + Math.floor(1000 + Math.random() * 9000);
    }

    // Hash password asynchronously
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new user into the database
    const [data] = await pool.execute(
      "INSERT INTO res_users (username, password, email, first_name, last_name, role_id, user_type, dial_code, phone, country_code ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        username,
        hashedPassword,
        email,
        first_name,
        last_name,
        role_id,
        user_type,
        dial_code,
        phone,
        country_code
      ]
    );

    // Fetch the newly created user
    const [user] = await pool.execute(
      "SELECT * FROM res_users WHERE user_id = ?",
      [data.insertId]
    );
    // Send back user details
    return res
      .status(201)
      .json({ message: "User registered successfully", user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getAllUserList(req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search ? `%${req.query.search}%` : null;
  const status = req.query.status !== undefined ? parseInt(req.query.status) : null;
  const isPremium = req.query.isPremium !== undefined ? req.query.isPremium === 'true' : null;
  const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
  const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

  const sortBy = req.query.sortBy || 'created_at';
  const sortOrder = req.query.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const allowedSortFields = ['user_id', 'first_name', 'username', 'balance', 'created_at'];
  const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';

  try {
    // If no filters are present, use a simpler query
    if (!search && status === null && isPremium === null && !startDate && !endDate) {
      const [users] = await pool.execute(
        `SELECT u.*, 
          CASE WHEN EXISTS (SELECT 1 FROM res_orders o WHERE o.user_id = u.user_id) THEN 1 ELSE 0 END as is_premium
         FROM res_users u
         ORDER BY ${validSortBy} ${sortOrder}
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      const [[{ total }]] = await pool.execute(
        'SELECT COUNT(*) as total FROM res_users'
      );

      return res.status(200).json({
        status: "success",
        response: {
          data: users,
          perPage: limit,
          totalCount: total,
          totalPages: Math.ceil(total / limit),
          currentPage: page,
          sortBy: validSortBy,
          sortOrder: sortOrder
        },
      });
    }

    // If filters are present, use the original complex query
    let baseQuery = `
      SELECT u.*, 
        CASE WHEN COUNT(o.order_id) > 0 THEN 1 ELSE 0 END as is_premium
      FROM res_users u
      LEFT JOIN res_orders o ON u.user_id = o.user_id
    `;

    const whereConditions = [];
    const queryParams = [];

    if (search) {
      whereConditions.push(`(
        u.user_id LIKE ? OR 
        u.username LIKE ? OR 
        u.email LIKE ? OR 
        u.phone LIKE ? OR 
        u.first_name LIKE ? OR 
        u.last_name LIKE ? OR
        CONCAT(u.first_name, ' ', u.last_name) LIKE ?
      )`);
      queryParams.push(search, search, search, search, search, search, search);
    }

    if (status !== null) {
      whereConditions.push("u.status = ?");
      queryParams.push(status);
    }

    if (isPremium !== null) {
      if (isPremium) {
        whereConditions.push("EXISTS (SELECT 1 FROM res_orders o WHERE o.user_id = u.user_id)");
      } else {
        whereConditions.push("NOT EXISTS (SELECT 1 FROM res_orders o WHERE o.user_id = u.user_id)");
      }
    }

    if (startDate) {
      whereConditions.push("DATE(u.created_at) >= DATE(?)");
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push("DATE(u.created_at) <= DATE(?)");
      queryParams.push(endDate);
    }

    if (whereConditions.length > 0) {
      baseQuery += " WHERE " + whereConditions.join(" AND ");
    }

    baseQuery += `
      GROUP BY u.user_id
      ORDER BY ${validSortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;
    queryParams.push(limit, offset);

    const [users] = await pool.execute(baseQuery, queryParams);

    let countQuery = `
      SELECT COUNT(DISTINCT u.user_id) AS total
      FROM res_users u
      LEFT JOIN res_orders o ON u.user_id = o.user_id
    `;

    if (whereConditions.length > 0) {
      countQuery += " WHERE " + whereConditions.join(" AND ");
    }

    const [[{ total }]] = await pool.execute(countQuery, queryParams.slice(0, -2));

    return res.status(200).json({
      status: "success",
      response: {
        data: users,
        perPage: limit,
        totalCount: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        sortBy: validSortBy,
        sortOrder: sortOrder
      },
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function getUserStats(req, res) {
  try {
    const [[totalUsers]] = await pool.execute(
      `SELECT COUNT(*) AS totalUsers FROM res_users`
    );

    const [[newUsers]] = await pool.execute(
      `SELECT COUNT(*) AS newUsers
       FROM res_users
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    const [[packageUsers]] = await pool.execute(
      `SELECT COUNT(DISTINCT user_id) AS packageUsers FROM res_upackages`
    );

    const [[todayUsers]] = await pool.execute(
      `SELECT COUNT(*) AS todayUsers
       FROM res_users
       WHERE DATE(created_at) = CURRENT_DATE()`
    );

    return res.status(200).json({
      status: "success",
      data: {
        totalUsers: Number(totalUsers?.totalUsers ?? 0),
        newUsers: Number(newUsers?.newUsers ?? 0),
        packageUsers: Number(packageUsers?.packageUsers ?? 0),
        todayUsers: Number(todayUsers?.todayUsers ?? 0),
      },
    });
  } catch (error) {
    console.error("User stats error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
}

async function searchUsers(req, res) {
  const { search } = req.query;
  
  try {
    let query = `
      SELECT 
        user_id,
        CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) as name,
        username,
        email
      FROM res_users
    `;
    
    const queryParams = [];
    
    if (search && search.trim()) {
      query += ` WHERE (
        username LIKE ? OR 
        email LIKE ? OR 
        CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) LIKE ?
      )`;
      const searchPattern = `%${search.trim()}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern);
    }
    
    query += ` ORDER BY username ASC LIMIT 50`;
    
    const [users] = await pool.execute(query, queryParams);
    
    return res.status(200).json({
      status: "success",
      data: users
    });
  } catch (error) {
    console.error("Search users error:", error);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error"
    });
  }
}



module.exports = {
  getAllUserList,
  addNewUser,
  checkEmailOrUsername,
  searchUsers,
  getUserStats,
};
