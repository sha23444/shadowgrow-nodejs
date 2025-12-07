const fs = require('fs');
const path = require('path');
const { pool } = require("../../config/database");

async function generateJsonFile(req, res) {
    const { tableName } = req.params;
    const connection = await pool.getConnection();
    try {
      // Query to get all data from the table
      const [rows] = await connection.query(`SELECT * FROM ??`, [tableName]);
  
      // Define the file path where the JSON will be stored

      const jsonDirectory = path.join(__dirname, '../../public/pages');
        
      if (!fs.existsSync(jsonDirectory)) {
            fs.mkdirSync(jsonDirectory, { recursive: true });
        }

        const filePath = path.join(jsonDirectory, `${tableName}.json`);

  
      // Write the data to a JSON file
      fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf-8');
        
      res.status(200).json({
//         success: true,
//         message: `JSON file created: ${filePath}`,
      });

    } catch (error) {
//       // console.error('Error generating JSON file:', error);
      res.status(500).json({
//         message: 'Internal server error',
//         status: 'error',
      });
    } finally {
      // Release the connection back to the pool
      if (connection) connection.release();
    }
  }

module.exports = {
    generateJsonFile
} 