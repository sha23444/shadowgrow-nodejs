const { pool } = require("../../config/database");

async function contactUsEnquiry(req, res) {
  try {
    const { name, email, phone, subject, message, user_id = null } = req.body;

    // table res_contact_enquiries
    const query = `
            INSERT INTO res_contact_enquiries (name, email, phone, subject, message, user_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

    await pool.query(query, [name, email, phone, subject, message, user_id]);

    res.status(201).json({
      message:
        "Your message has been submitted successfully and we will get back to you shortly",
      status: "success",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

// Get a list of file requests with pagination and search
async function getList(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Search parameters
    const search = req.query.search || '';
    const searchBy = req.query.searchBy || 'all'; // 'all', 'name', 'email', 'phone', 'subject', 'message'
    
    let whereClause = '';
    let searchParams = [];
    
    // Build search conditions
    if (search) {
      if (searchBy === 'all') {
        whereClause = `
          WHERE rfr.name LIKE ? 
          OR rfr.email LIKE ? 
          OR rfr.phone LIKE ? 
          OR rfr.subject LIKE ? 
          OR rfr.message LIKE ?
          OR u.username LIKE ?
          OR u.email LIKE ?
          OR u.phone LIKE ?
        `;
        const searchTerm = `%${search}%`;
        searchParams = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm];
      } else {
        // Search by specific field
        const validSearchFields = ['name', 'email', 'phone', 'subject', 'message'];
        if (validSearchFields.includes(searchBy)) {
          whereClause = `WHERE rfr.${searchBy} LIKE ?`;
          searchParams = [`%${search}%`];
        } else if (['user_name', 'user_email', 'user_phone'].includes(searchBy)) {
          // Search in user table
          const userField = searchBy.replace('user_', '');
          whereClause = `WHERE u.${userField} LIKE ?`;
          searchParams = [`%${search}%`];
        }
      }
    }

    const query = `
            SELECT rfr.id, rfr.name, rfr.email, rfr.phone, rfr.subject, rfr.message, rfr.created_at,
                   u.username AS user_name, u.email AS user_email, u.phone AS user_phone
            FROM res_contact_enquiries rfr
            LEFT JOIN res_users u ON rfr.user_id = u.user_id
            ${whereClause}
            ORDER BY rfr.created_at DESC
            LIMIT ? OFFSET ?
        `;

    // Fetch paginated file requests with search
    const [rows] = await pool.query(query, [...searchParams, limit, offset]);

    // Get total count for pagination metadata with search
    const countQuery = `
      SELECT COUNT(*) AS total 
      FROM res_contact_enquiries rfr
      LEFT JOIN res_users u ON rfr.user_id = u.user_id
      ${whereClause}
    `;
    
    const [[{ total }]] = await pool.query(countQuery, searchParams);

    let result = {
      data: rows,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      limit,
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
      search: search || null,
      searchBy: searchBy || null,
      status: "success",
    };

    res.status(200).json({
      response: result,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Internal server error",
      status: "error",
    });
  }
}

module.exports = {
  contactUsEnquiry,
  getList,
};
