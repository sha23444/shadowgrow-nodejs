const { pool } = require("../../../config/database");

const SAFE_EXCHANGE_RATE_EXPRESSION = `CASE WHEN t.exchange_rate IS NULL OR t.exchange_rate = 0 THEN 1 ELSE t.exchange_rate END`;

async function getBaseCurrencyInfo() {
  try {
    const [rows] = await pool.execute(
      `SELECT option_name, option_value 
       FROM res_options 
       WHERE option_name IN ('currency', 'currency_symbol')`
    );

    const currencyRow = rows.find(row => row.option_name === 'currency');
    const symbolRow = rows.find(row => row.option_name === 'currency_symbol');

    return {
      code: currencyRow ? currencyRow.option_value : 'USD',
      symbol: symbolRow ? symbolRow.option_value : '$',
    };
  } catch (error) {
    console.error('Error fetching base currency info:', error);
    return {
      code: 'USD',
      symbol: '$',
    };
  }
}

async function getTransactions(req, res) {
  const page = parseInt(req.query.page, 10) || 1; // Default to page 1
  const limit = parseInt(req.query.limit, 10) || 20; // Default items per page
  const offset = (page - 1) * limit; // Calculate offset for pagination
  const search = req.query.search || ""; // Search filter
  const user_id = req.query.user_id;

  // Check if user_id is provided
  if (!user_id) {
    return res.status(400).json({
      status: "error",
      message: "user_id is required",
    });
  }

  try {
    const baseCurrency = await getBaseCurrencyInfo();

    // Base WHERE conditions
    let whereConditions = [`user_id = ?`]; // user_id is mandatory
    let queryParams = [user_id];

    // Add search condition if search term exists
    if (search) {
      whereConditions.push(`(transaction_id LIKE ? OR reference LIKE ? OR description LIKE ?)`);
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Combine WHERE conditions
    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // Fetch total count for pagination
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM res_transactions ${whereClause}`,
      queryParams
    );

    // Fetch paginated transaction data
    const [transactions] = await pool.execute(
      `SELECT 
         t.*,
         t.amount / ${SAFE_EXCHANGE_RATE_EXPRESSION} AS amount_converted,
         ${SAFE_EXCHANGE_RATE_EXPRESSION} AS normalized_exchange_rate
       FROM res_transactions AS t ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    const normalizedTransactions = transactions.map(tx => {
      const {
        amount_converted,
        normalized_exchange_rate,
        ...rest
      } = tx;

      const safeRate = Number(normalized_exchange_rate || 1) || 1;
      const amountConverted =
        amount_converted != null
          ? Number(amount_converted)
          : Number(rest.amount || 0) / safeRate;

      return {
        ...rest,
        amount_original: Number(rest.amount || 0),
        currency_original: rest.currency,
        amount: Number.isFinite(amountConverted) ? amountConverted : Number(rest.amount || 0),
        currency: baseCurrency.code,
        exchange_rate: safeRate,
      };
    });

    // Construct the paginated response
    const result = {
      data: normalizedTransactions,
      perPage: limit,
      totalCount: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
      currency: baseCurrency,
    };

    // Return the response
    return res.status(200).json({
      status: "success",
      response: result,
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "error",
      message: "Internal Server Error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

module.exports = { getTransactions };

