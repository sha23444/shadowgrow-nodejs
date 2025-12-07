const express = require("express");
const { pool} = require("../../config/database");

async function create(req, res) {
  const { transactionId, itemId, dueDate} = req.body;

  try {
    
    await pool.execute("INSERT INTO invoice (transactionId, itemId, dueDate) VALUES (?, ?)", [
        transactionId,
        itemId,
        dueDate
    ]);

    res.status(201).json({ message: "Invoice created successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function login(req, res, next) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: "Username and password are required",
    });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const storedHashedPassword = rows[0].password;
    const passwordMatch = await bcryptjs.compare(
      password,
      storedHashedPassword
    );
  
    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const user = {
      id: rows[0].id,
      username: rows[0].username,
    };

    const token = jwt.sign(user, secretKey, { expiresIn: "1h" });

    res.json({ token });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function invoices(req, res) {
  try {
    const [data] = await pool.execute("SELECT * FROM res_invoices");
    console.log(data);
    return res.status(200).json({
      data: data,
    });
  } catch (error) {
    console.error("Database error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = { create, login, invoices };
