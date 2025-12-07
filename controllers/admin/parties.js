const { pool, secretKey } = require("../../config/database");


async function register(req, res) {
    const {
      partyName,
      gstin,
      phone,
      state,
      email,
      billingAddress,
      shippingAddress,
      openingBalance,
      asOfDate,
      creditLimit,
      creditType,
      notes
    } = req.body;
  
    if (!partyName || !gstin || !phone || !state || !email) {
      return res
        .status(400)
        .json({ error: "Party name, GSTIN, phone, state, and email are required" });
    }
  
    try {
      // Check if the email is already registered
      const [existingEmail] = await pool.execute(
        "SELECT * FROM parties WHERE email = ?",
        [email]
      );
  
      if (existingEmail.length > 0) {
        return res.status(409).json({ error: "Email already exists" });
      }
  
      // Check if the phone is already registered
      const [existingPhone] = await pool.execute(
        "SELECT * FROM parties WHERE phone = ?",
        [phone]
      );
  
      if (existingPhone.length > 0) {
        return res.status(409).json({ error: "Phone number already exists" });
      }
  
      // If both email and phone are unique, proceed with registration
      const insertQuery = `
        INSERT INTO parties (
          partyName,
          gstin,
          phone,
          state,
          email,
          billingAddress,
          shippingAddress,
          openingBalance,
          asOfDate,
          creditLimit,
          creditType,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
  
      await pool.execute(insertQuery, [
        partyName,
        gstin,
        phone,
        state,
        email,
        billingAddress,
        shippingAddress,
        openingBalance,
        asOfDate,
        creditLimit,
        creditType,
        notes
      ]);
  
      res.status(201).json({ message: "Data registered successfully" });
    } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }

async function list(req, res) {
  try {
    const [data] = await pool.execute("SELECT * FROM parties");
    console.log(data);
    return res.status(200).json({
      data: data,
    });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getById(req, res) {
  const partyId = req.params.id;

  try {
    const [data] = await pool.execute("SELECT * FROM parties WHERE id = ?", [partyId]);

    if (data.length === 0) {
      return res.status(404).json({ error: "Party not found" });
    }

    return res.status(200).json({
      data: data[0], // Assuming you want to return a single party object
    });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}




module.exports = { register, list, getById };
