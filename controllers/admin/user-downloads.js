const { pool, secretKey } = require("../../config/database");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { DATE } = require("sequelize");
const crypto = require("crypto");
const { promisify } = require("util");
const randomBytesAsync = promisify(crypto.randomBytes);

async function getList(req, res) {
    try {
      const page = req.query.page || 1;
      const pageSize = req.query.pageSize || 50; // Set your desired page size
  
      const offset = (page - 1) * pageSize;
  
      const [rows, totalRows] = await Promise.all([
        pool.execute("SELECT * FROM res_udownloads LIMIT ?, ?", [offset, pageSize]),
        pool.execute("SELECT COUNT(*) as total FROM res_udownloads")
      ]);
  
      const totalItems = totalRows[0][0].total; // Retrieve the total count from the result
  
      console.log(totalItems);
      return res.status(200).json({
        data: rows[0],
        totalItems: totalItems
      });
    } catch (error) {
      console.error("Database error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
  
module.exports = {
  getList
};
