const express = require("express");
const { pool } = require("../../config/database");

async function getPackageDetails(req, res) {
  try {
    const id = req.query.id;

    let query;
    let params;

    if (id) {
      // If ID is provided, fetch details for a specific package
      query = "SELECT * FROM res_download_packages WHERE package_id = ? AND is_active = 1 ORDER BY `order` ASC";
      params = [id];
    } else {
      // If no ID is provided, fetch all public packages
      query = "SELECT * FROM res_download_packages WHERE is_public = ? AND is_active = 1 ORDER BY `order` ASC";
      params = ["1"];
    }

    const [rows] = await pool.execute(query, params);

    // Process packages to add calculated fields for frontend
    const processedPackages = rows.map(package => {
      const processedPackage = { ...package };
      
      // Convert price values to numbers for proper comparison
      const actualPrice = parseFloat(processedPackage.actual_price) || 0;
      const currentPrice = parseFloat(processedPackage.price) || 0;
      
      // Calculate discount percentage if actual_price is available and higher than price
      if (actualPrice > 0 && actualPrice > currentPrice) {
        processedPackage.discount_percentage = Math.round(
          ((actualPrice - currentPrice) / actualPrice) * 100
        );
        processedPackage.discount_amount = actualPrice - currentPrice;
        processedPackage.has_discount = true;
      } else {
        processedPackage.discount_percentage = 0;
        processedPackage.discount_amount = 0;
        processedPackage.has_discount = false;
      }

      // Ensure marketing_text is null if empty string
      if (processedPackage.marketing_text === '') {
        processedPackage.marketing_text = null;
      }

      // Ensure badge is null if empty string
      if (processedPackage.badge === '') {
        processedPackage.badge = null;
      }

      return processedPackage;
    });

    return res.status(200).json({
      status: "success",
      response: {
        data: processedPackages,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
}

async function getPackages(req, res) {
  try {
    const query = "SELECT * FROM res_download_packages WHERE is_public = 1 AND is_active = 1 ORDER BY date_create DESC";
    const [rows] = await pool.execute(query);

    // Process packages to add calculated fields for frontend
    const processedPackages = rows.map(package => {
      const processedPackage = { ...package };
      
      // Convert price values to numbers for proper comparison
      const actualPrice = parseFloat(processedPackage.actual_price) || 0;
      const currentPrice = parseFloat(processedPackage.price) || 0;
      
      // Calculate discount percentage if actual_price is available and higher than price
      if (actualPrice > 0 && actualPrice > currentPrice) {
        processedPackage.discount_percentage = Math.round(
          ((actualPrice - currentPrice) / actualPrice) * 100
        );
        processedPackage.discount_amount = actualPrice - currentPrice;
        processedPackage.has_discount = true;
      } else {
        processedPackage.discount_percentage = 0;
        processedPackage.discount_amount = 0;
        processedPackage.has_discount = false;
      }

      // Ensure marketing_text is null if empty string
      if (processedPackage.marketing_text === '') {
        processedPackage.marketing_text = null;
      }

      // Ensure badge is null if empty string
      if (processedPackage.badge === '') {
        processedPackage.badge = null;
      }

      return processedPackage;
    });

    return res.status(200).json({
      status: "success",
      response: {
        data: processedPackages,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
}

module.exports = { getPackageDetails, getPackages };
