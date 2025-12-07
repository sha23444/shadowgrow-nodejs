// admin.factory.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const { pool } = require("../config/database");

dotenv.config();

const seedAdmin = async () => {
  const data = {
//     name: 'admin',
//     email: 'admin@admin.com', // Change the email address as needed
//     password: await bcrypt.hash('secret', 10),
  };

  try {
    // Check if the admin already exists in the database
    const [existingAdmin] = await pool.execute(
      "SELECT * FROM res_admins WHERE email = ?",
      [data.email]
    );

    let adminId;

    if (existingAdmin.length > 0) {
      // Admin already exists, use the existing record
      adminId = existingAdmin[0].id;
    } else {
      // Insert new admin record into the database
      const insertQuery = `
        INSERT INTO res_admins (
          username,
          email,
          password,
          fullName
        ) VALUES (?, ?, ?, ?)
      `;

      const [result] = await pool.execute(insertQuery, [
        data.name,
        data.email,
        data.password,
        data.name,
      ]);

      adminId = result.insertId;
    }

    // Generate token at runtime (not saved in the database)
    const token = jwt.sign(
      { adminId, access: 'auth' },
      process.env.SECRET_KEY,
      { expiresIn: '30d' }
    );

    return { id: adminId, token, ...data };
  } catch (error) {
//     // console.error('Error in seedAdmin:', error);
    throw error;
  }
};

module.exports = seedAdmin;
