const axios = require("axios");
const { pool } = require("../../config/database"); // Adjust the path as necessary
const jwt = require("jsonwebtoken");

async function getUserLocation(req, res) {
  try {
    const ipFromHeader = req.headers["x-forwarded-for"]
      ? req.headers["x-forwarded-for"].split(",")[0].trim()
      : req.connection.remoteAddress || req.socket.remoteAddress;

    const ip = ipFromHeader || "51.158.203.8"; // Default IP for testing
    const token = req.headers.authorization || req.headers.Authorization;
    let userId = null;

    if (token) {
      const t = token.split(" ")[1];
      try {
        const user = jwt.verify(t, process.env.SECRET_KEY);
        userId = user?.id || null;
      } catch (err) {
        console.warn("Token verification failed:", err.message);
      }
    }

    // Fetch store base currency
    const [storeBaseCurrency] = await pool.execute(
      `SELECT option_value FROM res_options WHERE option_name = ?`,
      ["currency"]
    );

    const defaultCurrency = storeBaseCurrency?.[0]?.option_value || "USD"; // Fallback to USD
    let currencyCode = defaultCurrency;
    let geoResponse = null;

    // Perform geolocation lookup and determine currency concurrently
    try {
      if (ip && ip !== "0.0.0.0") {
        const geoRes = await axios.get(
          `https://geolocation-db.com/json/${ip}&position=true`
        );
        geoResponse = geoRes.data;

        if (geoResponse?.country_code) {
          const countryCode = geoResponse.country_code;

          // Fetch the currency code for the country
          const [currencyRows] = await pool.execute(
            `SELECT currency_code FROM res_exchange_rates WHERE country_code = ?`,
            [countryCode]
          );

          if (currencyRows.length > 0) {
            currencyCode = currencyRows[0].currency_code;
          }
        }
      }
    } catch (geoError) {
      console.warn("Geolocation failed, using default currency:", geoError.message);
    }

    // Ensure the currency code is valid
    try {
      const [currencyExist] = await pool.execute(
        `SELECT currency_code FROM res_currencies WHERE currency_code = ? AND status = ?`,
        [currencyCode, 1]
      );

      if (currencyExist.length === 0) {
        currencyCode = defaultCurrency;
      }
    } catch (validationError) {
      console.warn("Currency validation failed, using default:", validationError.message);
      currencyCode = defaultCurrency;
    }

    // Update user location if logged in
    if (userId && geoResponse) {
      try {
        await pool.execute(
          `UPDATE res_users SET country_code = ?, country = ?, city = ?, postal = ?, latitude = ?, longitude = ?, ip_address = ?, state = ? WHERE user_id = ?`,
          [
            geoResponse.country_code,
            geoResponse.country_name,
            geoResponse.city,
            geoResponse.postal,
            geoResponse.latitude,
            geoResponse.longitude,
            geoResponse.IPv4,
            geoResponse.state,
            userId,
          ]
        );
      } catch (updateError) {
        console.error("Error updating user location:", updateError.message);
      }
    }

    // Send the currency code
    res.json({ currencyCode });
  } catch (error) {
    console.error("Unexpected error:", error.message);
    res.status(500).json({
      message: "Unable to determine currency",
      error: error.message,
    });
  }
}


module.exports = {
  getUserLocation,
};
