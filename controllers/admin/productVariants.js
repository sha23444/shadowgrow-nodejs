const { pool } = require("../../config/database");

// Add a new product variant
async function addVariant(req, res) {
  const {
    product_id,
    variant_sku,
    variant_name,
    variant_price,
    variant_stock_quantity,
    color,
    size,
    material,
    weight,
    dimensions,
    variant_image_url,
    is_active = 1
  } = req.body;

  // Validate required fields
  if (!product_id || !variant_sku || !variant_name || !variant_price || variant_stock_quantity === undefined) {
    return res.status(400).json({ 
      error: "Missing required fields",
      details: ["product_id", "variant_sku", "variant_name", "variant_price", "variant_stock_quantity"]
    });
  }

  try {
    // Check if product exists
    const [productCheck] = await pool.execute(
      'SELECT product_id FROM res_products WHERE product_id = ?',
      [product_id]
    );

    if (productCheck.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Check if variant SKU already exists
    const [skuCheck] = await pool.execute(
      'SELECT variant_id FROM res_product_variants WHERE variant_sku = ?',
      [variant_sku]
    );

    if (skuCheck.length > 0) {
      return res.status(409).json({ error: "Variant SKU already exists" });
    }

    await pool.execute(
      `INSERT INTO res_product_variants (
        product_id,
        variant_sku, 
        variant_name, 
        variant_price, 
        variant_stock_quantity, 
        color, 
        size, 
        material, 
        weight, 
        dimensions, 
        variant_image_url,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        product_id,
        variant_sku,
        variant_name,
        variant_price,
        variant_stock_quantity,
        color,
        size,
        material,
        weight,
        dimensions,
        variant_image_url,
        is_active
      ]
    );

    res.status(201).json({ message: "Variant added successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Update a product variant
async function updateVariant(req, res) {
  const { variantId } = req.params;
  const {
    variant_sku,
    variant_name,
    variant_price,
    variant_stock_quantity,
    color,
    size,
    material,
    weight,
    dimensions,
    variant_image_url,
    is_active
  } = req.body;

  try {
    // Check if variant exists
    const [variantCheck] = await pool.execute(
      'SELECT variant_id FROM res_product_variants WHERE variant_id = ?',
      [variantId]
    );

    if (variantCheck.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }

    // Check if variant SKU already exists (excluding current variant)
    if (variant_sku) {
      const [skuCheck] = await pool.execute(
        'SELECT variant_id FROM res_product_variants WHERE variant_sku = ? AND variant_id != ?',
        [variant_sku, variantId]
      );

      if (skuCheck.length > 0) {
        return res.status(409).json({ error: "Variant SKU already exists" });
      }
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];

    if (variant_sku !== undefined) {
      updateFields.push('variant_sku = ?');
      updateValues.push(variant_sku);
    }
    if (variant_name !== undefined) {
      updateFields.push('variant_name = ?');
      updateValues.push(variant_name);
    }
    if (variant_price !== undefined) {
      updateFields.push('variant_price = ?');
      updateValues.push(variant_price);
    }
    if (variant_stock_quantity !== undefined) {
      updateFields.push('variant_stock_quantity = ?');
      updateValues.push(variant_stock_quantity);
    }
    if (color !== undefined) {
      updateFields.push('color = ?');
      updateValues.push(color);
    }
    if (size !== undefined) {
      updateFields.push('size = ?');
      updateValues.push(size);
    }
    if (material !== undefined) {
      updateFields.push('material = ?');
      updateValues.push(material);
    }
    if (weight !== undefined) {
      updateFields.push('weight = ?');
      updateValues.push(weight);
    }
    if (dimensions !== undefined) {
      updateFields.push('dimensions = ?');
      updateValues.push(dimensions);
    }
    if (variant_image_url !== undefined) {
      updateFields.push('variant_image_url = ?');
      updateValues.push(variant_image_url);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    updateValues.push(variantId);

    await pool.execute(
      `UPDATE res_product_variants SET ${updateFields.join(', ')} WHERE variant_id = ?`,
      updateValues
    );

    res.status(200).json({ message: "Variant updated successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Delete a product variant
async function deleteVariant(req, res) {
  const { variantId } = req.params;

  try {
    // Check if variant exists
    const [variantCheck] = await pool.execute(
      'SELECT variant_id FROM res_product_variants WHERE variant_id = ?',
      [variantId]
    );

    if (variantCheck.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }

    await pool.execute(
      'DELETE FROM res_product_variants WHERE variant_id = ?',
      [variantId]
    );

    res.status(200).json({ message: "Variant deleted successfully" });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get all variants for a specific product
async function getProductVariants(req, res) {
  const { productId } = req.params;

  try {
    // Check if product exists
    const [productCheck] = await pool.execute(
      'SELECT product_id FROM res_products WHERE product_id = ?',
      [productId]
    );

    if (productCheck.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const [variants] = await pool.execute(
      `SELECT 
        variant_id, 
        product_id,
        variant_sku, 
        variant_name, 
        variant_price, 
        variant_stock_quantity, 
        color, 
        size, 
        material, 
        weight, 
        dimensions, 
        variant_image_url,
        is_active,
        created_at,
        updated_at
      FROM res_product_variants 
      WHERE product_id = ? 
      ORDER BY created_at DESC`,
      [productId]
    );

    res.status(200).json({
      message: "Product variants fetched successfully",
      data: variants
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get a single variant by ID
async function getVariantById(req, res) {
  const { variantId } = req.params;

  try {
    const [variants] = await pool.execute(
      `SELECT 
        variant_id, 
        product_id,
        variant_sku, 
        variant_name, 
        variant_price, 
        variant_stock_quantity, 
        color, 
        size, 
        material, 
        weight, 
        dimensions, 
        variant_image_url,
        is_active,
        created_at,
        updated_at
      FROM res_product_variants 
      WHERE variant_id = ?`,
      [variantId]
    );

    if (variants.length === 0) {
      return res.status(404).json({ error: "Variant not found" });
    }

    res.status(200).json({
      message: "Variant details fetched successfully",
      data: variants[0]
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

// Get all variants (for admin listing)
async function getAllVariants(req, res) {
  try {
    const [variants] = await pool.execute(
      `SELECT 
        v.variant_id, 
        v.product_id,
        v.variant_sku, 
        v.variant_name, 
        v.variant_price, 
        v.variant_stock_quantity, 
        v.color, 
        v.size, 
        v.material, 
        v.weight, 
        v.dimensions, 
        v.variant_image_url,
        v.status,
        v.created_at,
        v.updated_at,
        p.product_name,
        p.sku as product_sku
      FROM res_product_variants v
      LEFT JOIN res_products p ON v.product_id = p.product_id
      ORDER BY v.created_at DESC`
    );

    res.status(200).json({
      message: "All variants fetched successfully",
      data: variants
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

module.exports = { 
  addVariant, 
  updateVariant, 
  deleteVariant, 
  getProductVariants, 
  getVariantById,
  getAllVariants
};
