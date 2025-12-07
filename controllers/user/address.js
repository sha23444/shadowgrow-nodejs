const { pool } = require("../../config/database");

async function addUserAddress(req, res) {
  const { id } = req.user;

  const {
    name,
    phone,
    alternate_phone,
    address,
    locality,
    landmark,
    city,
    state_code,
    zip_code,
    country_code,
    address_type,
  } = req.body;

  if (!name || !phone || !address) {
    return res
      .status(400)
      .json({ message: "Please fill all required fields", status: "error" });
  }

  try {
    // check if user already has a default address

    const [defaultAddress] = await pool.query(
      `SELECT * FROM res_user_addresses WHERE user_id = ? AND is_default = 1`,
      [id]
    );

    // if user already has a default address, set it to non-default

    if (defaultAddress.length > 0) {
      await pool.query(
        `UPDATE res_user_addresses SET is_default = 0 WHERE user_id = ? AND is_default = 1`,
        [id]
      );
    }

    const [result] = await pool.query(
      `INSERT INTO res_user_addresses (user_id, name, phone, alternate_phone, address, locality, landmark, city, state_code, zip_code, country_code, address_type, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        phone,
        alternate_phone,
        address,
        locality,
        landmark,
        city,
        state_code,
        zip_code,
        country_code,
        address_type,
        1,
      ]
    );

    const address_id = result.insertId;

    if (result.affectedRows > 0) {
      res
        .status(201)
        .json({ message: "Address added successfully", status: "success",
//           address_id: address_id
         });
    } else {
      res
        .status(500)
        .json({ message: "Failed to add address", status: "error" });
    }
  } catch (err) {
//     // console.error(err);
    res.status(500).json({ message: "Internal server error", status: "error" });
  }
}

async function getUserAddresses(req, res) {
  const { id } = req.user; // Extract user ID from request

  try {
    // Fetch user addresses along with state and country names, prioritizing default address
    const [addresses] = await pool.query(
      `SELECT rua.*, 
        (SELECT s.name FROM states s WHERE s.iso2 = rua.state_code COLLATE utf8mb4_general_ci LIMIT 1) AS state_name,
        (SELECT c.name FROM countries c WHERE c.iso2 = rua.country_code COLLATE utf8mb4_general_ci LIMIT 1) AS country_name
      FROM res_user_addresses rua
      WHERE rua.user_id = ?
      GROUP BY rua.address_id
      ORDER BY rua.is_default DESC, rua.address_id ASC`, // Default first, then by address_id
      [id]
    );

    res.status(200).json({ data: addresses, status: "success" });
  } catch (err) {
//     // console.error("Error fetching user addresses:", err);
    res.status(500).json({ message: "Internal server error", status: "error" });
  }
}


module.exports = {
  addUserAddress,
  getUserAddresses,
};
