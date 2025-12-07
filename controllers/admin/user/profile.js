const { pool } = require("../../../config/database");
const bcrypt = require("bcryptjs");

const SAFE_EXCHANGE_RATE_EXPRESSION = `CASE WHEN exchange_rate IS NULL OR exchange_rate = 0 THEN 1 ELSE exchange_rate END`;

async function getProfile(req, res) {
  const { userId: id } = req.query;

  try {
    const [[user]] = await pool.execute(
      `SELECT * FROM res_users WHERE user_id = ?`,
      [id]
    );

    res.status(200).json({
      user,
      status: "success",
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}


async function getStats(req, res) {
  const { userId: id } = req.query;

  try {
    const [[totalDownloads]] = await pool.execute(
      `SELECT COUNT(*) as totalDownloads FROM res_udownloads WHERE user_id = ?`,
      [id]
    );

    const [[downloadsLast30]] = await pool.execute(
      `SELECT COUNT(*) as downloadsLast30 
       FROM res_udownloads 
       WHERE user_id = ? 
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [id]
    );

    const [[lastDownloadRow]] = await pool.execute(
      `SELECT MAX(created_at) AS lastDownloadDate 
       FROM res_udownloads 
       WHERE user_id = ?`,
      [id]
    );

    const [[orderAggregates]] = await pool.execute(
      `SELECT 
         COUNT(*) AS totalOrders,
         SUM(CASE WHEN payment_status = 2 THEN amount_paid / ${SAFE_EXCHANGE_RATE_EXPRESSION} ELSE 0 END) AS paidAmount,
         COUNT(CASE WHEN payment_status = 2 THEN 1 END) AS paidOrders,
         MAX(created_at) AS lastOrderDate
       FROM res_orders
       WHERE user_id = ?`,
      [id]
    );

    const [[totalPackages]] = await pool.execute(
      `SELECT COUNT(*) as totalActivePackages 
       FROM res_upackages 
       WHERE user_id = ? AND is_active = 1 AND date_expire > NOW()`,
      [id]
    );

    const [activePackagesPreview] = await pool.execute(
      `SELECT 
         package_title,
         date_create,
         date_expire,
         is_current
       FROM res_upackages
       WHERE user_id = ? AND is_active = 1
       ORDER BY date_expire ASC
       LIMIT 3`,
      [id]
    );

    const [[userMeta]] = await pool.execute(
      `SELECT balance, last_login_at, created_at 
       FROM res_users 
       WHERE user_id = ?`,
      [id]
    );

    const totalOrders = Number(orderAggregates?.totalOrders ?? 0);
    const paidOrders = Number(orderAggregates?.paidOrders ?? 0);
    const totalSpend = Number(orderAggregates?.paidAmount ?? 0);
    const averageOrderValue =
      paidOrders > 0 ? totalSpend / paidOrders : 0;

    res.status(200).json({
      totalDownloads: Number(totalDownloads?.totalDownloads ?? 0),
      downloadsLast30: Number(downloadsLast30?.downloadsLast30 ?? 0),
      lastDownloadDate: lastDownloadRow?.lastDownloadDate || null,
      totalOrders,
      paidOrders,
      totalSpend,
      averageOrderValue,
      lastOrderDate: orderAggregates?.lastOrderDate || null,
      totalActivePackages: Number(totalPackages?.totalActivePackages ?? 0),
      activePackagesPreview,
      walletBalance:
        userMeta?.balance !== undefined && userMeta?.balance !== null
          ? Number(userMeta.balance)
          : 0,
      lastLogin: userMeta?.last_login_at || null,
      memberSince: userMeta?.created_at || null,
      status: "success",
    });

  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function updateProfile(req, res) {
  const { user_id, username, first_name, last_name, photo, email, phone, dial_code, country, city, state, postal, address, status, is_mobile_verified, is_email_verified } = req.body;

  // Sanitize and validate input data
  const sanitizedData = {
    user_id: user_id,
    username: username || '',
    first_name: first_name || '',
    last_name: last_name || '',
    photo: photo || null,
    email: email || '',
    phone: phone || '',
    dial_code: (dial_code === '' || dial_code === null || dial_code === undefined) ? null : parseInt(dial_code),
    country: country || null,
    city: city || null,
    state: state || null,
    postal: postal || null,
    address: address || null,
    status: status || 1,
    is_mobile_verified: is_mobile_verified || 0,
    is_email_verified: is_email_verified || 0
  };

  try {
    // check if the user exists
    const [[user]] = await pool.execute(
      `SELECT * FROM res_users WHERE user_id = ?`,
      [sanitizedData.user_id]
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // check email if exists
    const [[emailExists]] = await pool.execute(
      `SELECT * FROM res_users WHERE email = ? AND user_id != ?`,
      [sanitizedData.email, sanitizedData.user_id]
    );

    if (emailExists) {
      return res.status(400).json({ error: "Email already exists", status: "fail" });
    }

    // check username if exists
    const [[usernameExists]] = await pool.execute(
      `SELECT * FROM res_users WHERE username = ? AND user_id != ?`,
      [sanitizedData.username, sanitizedData.user_id]
    );

    if (usernameExists) {
      return res.status(400).json({ error: "Username already exists", status: "fail" });
    }

    // Get a connection for transaction
    const connection = await pool.getConnection();
    
    try {
      // Start transaction
      await connection.beginTransaction();
      
      // update the user profile within transaction
      const updateQuery = `UPDATE res_users SET first_name = ?, last_name = ?, username = ?,  photo = ?, email = ?, phone = ?, dial_code = ?, country = ?, city = ?, state = ?, postal = ?, address = ? , status = ? , is_mobile_verified = ?, is_email_verified = ? WHERE user_id = ?`;
      const updateValues = [
        sanitizedData.first_name, 
        sanitizedData.last_name, 
        sanitizedData.username, 
        sanitizedData.photo, 
        sanitizedData.email, 
        sanitizedData.phone, 
        sanitizedData.dial_code, 
        sanitizedData.country, 
        sanitizedData.city, 
        sanitizedData.state, 
        sanitizedData.postal, 
        sanitizedData.address, 
        sanitizedData.status, 
        sanitizedData.is_mobile_verified, 
        sanitizedData.is_email_verified, 
        sanitizedData.user_id
      ];

      const [updateResult] = await connection.execute(updateQuery, updateValues);

      // Verify the update within the same transaction
      const [[updatedUser]] = await connection.execute(
        `SELECT user_id, username, email, first_name, last_name, phone, dial_code, country, city, state, postal, address, status, is_mobile_verified, is_email_verified FROM res_users WHERE user_id = ?`,
        [sanitizedData.user_id]
      );

      // Verify the email was actually updated
      if (updatedUser.email !== sanitizedData.email) {
        throw new Error("Email update verification failed");
      }

      // Commit transaction
      await connection.commit();

      res.status(200).json({
        message: "Profile updated successfully",
        status: "success",
        data: {
          email: updatedUser.email,
          username: updatedUser.username,
          first_name: updatedUser.first_name,
          last_name: updatedUser.last_name,
          phone: updatedUser.phone,
          dial_code: updatedUser.dial_code,
          country: updatedUser.country,
          city: updatedUser.city,
          state: updatedUser.state,
          postal: updatedUser.postal,
          address: updatedUser.address,
          status: updatedUser.status,
          is_mobile_verified: updatedUser.is_mobile_verified,
          is_email_verified: updatedUser.is_email_verified
        }
      });
      
    } catch (error) {
      // Rollback transaction on error
      await connection.rollback();
      throw error;
    } finally {
      // Release connection
      connection.release();
    }
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function changePassword(req, res) {
  const { user_id, password } = req.body;

  try {
    // Check if the user exists
    const [[user]] = await pool.execute(
      `SELECT * FROM res_users WHERE user_id = ?`,
      [user_id]
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update the password in the database
    const [data] = await pool.execute(
      "UPDATE res_users SET password = ? WHERE user_id = ?",
      [hashedPassword, user_id]
    );

    if (data.affectedRows === 0) {
      return res.status(400).json({ error: "Failed to update password" });
    }


    res.status(200).json({
      message: "Password updated successfully",
      status: "success",
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}


async function deleteProfile(req, res) {
  const { user_id } = req.body;
  
  // Input validation and sanitization
  if (!user_id || typeof user_id !== 'string' && typeof user_id !== 'number') {
    return res.status(400).json({ 
      error: "Valid user_id is required", 
      status: "fail" 
    });
  }

  // Sanitize user_id
  const sanitizedUserId = parseInt(user_id);
  if (isNaN(sanitizedUserId) || sanitizedUserId <= 0) {
    return res.status(400).json({ 
      error: "Invalid user_id format", 
      status: "fail" 
    });
  }

  // Get a connection for transaction
  const connection = await pool.getConnection();
  
  try {
    // Start transaction
    await connection.beginTransaction();
    
    // Check if user exists before deletion
    const [[user]] = await connection.execute(
      "SELECT user_id, username, email FROM res_users WHERE user_id = ?",
      [sanitizedUserId]
    );

    if (!user) {
      await connection.rollback();
      return res.status(404).json({ 
        error: "User not found", 
        status: "fail" 
      });
    }

    console.log(`Starting deletion process for user: ${user.username} (ID: ${sanitizedUserId})`);

    // Define deletion order to respect foreign key constraints
    // Delete in reverse dependency order (child tables first, then parent)
    const deletionQueries = [
      { table: 'res_udownloads', description: 'user downloads' },
      { table: 'res_upackages', description: 'user packages' },
      { table: 'res_orders', description: 'user orders' },
      { table: 'res_transactions', description: 'user transactions' },
      { table: 'res_transfers', description: 'user transfers' },
      { table: 'res_admin_notifications', description: 'admin notifications' },
      { table: 'res_ratings', description: 'user ratings' },
      { table: 'res_users', description: 'user profile' }
    ];

    const deletionResults = [];
    
    // Execute deletions in sequence to maintain referential integrity
    for (const query of deletionQueries) {
      try {
        const [result] = await connection.execute(
          `DELETE FROM ${query.table} WHERE user_id = ?`,
          [sanitizedUserId]
        );
        
        deletionResults.push({
          table: query.table,
          description: query.description,
          affectedRows: result.affectedRows
        });
        
        console.log(`Deleted ${result.affectedRows} records from ${query.table}`);
      } catch (error) {
        console.error(`Error deleting from ${query.table}:`, error);
        // Continue with other deletions even if one fails
      }
    }

    // Verify main user deletion was successful
    const mainUserDeletion = deletionResults.find(r => r.table === 'res_users');
    if (!mainUserDeletion || mainUserDeletion.affectedRows === 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: "Failed to delete user profile", 
        status: "fail" 
      });
    }

    // Commit transaction
    await connection.commit();

    console.log(`Successfully deleted user profile and related data for user ID: ${sanitizedUserId}`);

    res.status(200).json({
      message: "Profile and all related data deleted successfully",
      status: "success",
      data: {
        deletedUser: {
          id: sanitizedUserId,
          username: user.username,
          email: user.email
        },
        deletionSummary: deletionResults
      }
    });

  } catch (error) {
    // Rollback transaction on error
    await connection.rollback();
    console.error("Database error during user deletion:", error);
    res.status(500).json({ 
      error: "Internal Server Error", 
      status: "fail",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    // Release connection
    connection.release();
  }
} 

module.exports = {
  getProfile,
  getStats,
  changePassword,
  updateProfile,
  deleteProfile,
};
