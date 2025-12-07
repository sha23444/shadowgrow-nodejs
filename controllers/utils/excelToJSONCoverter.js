const XLSX = require("xlsx");
const fs = require("fs").promises; // Using promises from fs for async
const path = require("path");
const excel = require("exceljs");

async function convert(req, res, next) {
  try {
    // Construct the file path using path.join
    const excelFilePath = path.join(
      __dirname,
      "../../",
      "public",
      "docs",
      "notification.xlsx"
    );

    // Check if the file exists before attempting to read it
    if (await fileExists(excelFilePath)) {
      // Load Excel file
      const workbook = XLSX.readFile(excelFilePath);

      // Assume the first sheet is the one you want to convert
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert sheet to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // Save JSON to a file with an absolute path
      const jsonFilePath = path.join(
        __dirname,
        "../../",
        "public",
        "notification.json"
      );
      await fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2));

      res.json({ jsonFilePath });
    } else {
      return res.status(400).json({
//         error: `File not found: ${excelFilePath}`,
      });
    }
  } catch (error) {
//     // console.error("Error:", error);
    return res.status(500).json({
//       error: "Internal Server Error",
    });
  }
}

async function jsonToExcel(req, res, next) {
    try {
      const jsonFilePath = path.join(__dirname, "../../", "public", "students.json");
      const jsonData = await fs.readFile(jsonFilePath, 'utf-8');
      const parsedData = JSON.parse(jsonData);
  
      // Create a new workbook and add a worksheet
      const workbook = new excel.Workbook();
      const worksheet = workbook.addWorksheet("Sheet 1");
  
      // Add headers to the worksheet
      const headers = Object.keys(parsedData[0]);
      worksheet.addRow(headers);
  
      // Add data to the worksheet
      parsedData.forEach((row) => {
        const values = headers.map((header) => row[header]);
        worksheet.addRow(values);
      });
  
      // Save the workbook to a file
      const excelFilePath = path.join(__dirname, "../../", "public", "converted-json.xlsx");
  
      await workbook.xlsx.writeFile(excelFilePath);
  
      res.json({
//         status: "success",
//         message: "Excel File created successfully",
//         file: excelFilePath,
      });
    } catch (error) {
//       // console.error(error); // Log the error for debugging purposes
      return res.status(500).json({
//         error: "An unexpected error occurred",
      });
    }
  }

// Helper function to check if a file exists
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = { convert, jsonToExcel };
