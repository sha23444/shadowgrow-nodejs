const { pool } = require("../../config/database");


const getAllAttributes = async (req, res) => {
  try {
    // Fetch all attributes ordered by display_order
    const [attributes] = await pool.execute(`
      SELECT 
        id,
        name,
        slug,
        display_order,
        applicable_product_types,
        created_at,
        updated_at
      FROM res_product_attributes 
      ORDER BY display_order ASC, name ASC
    `);

    if (!attributes.length) {
      return res
        .status(404)
        .json({ message: "No attributes found." });
    }

    // Parse JSON fields and format response
    const formattedAttributes = attributes.map(attr => ({
      id: attr.id,
      name: attr.name,
      slug: attr.slug,
      display_order: attr.display_order,
      applicable_product_types: attr.applicable_product_types ? JSON.parse(attr.applicable_product_types) : [],
      created_at: attr.created_at,
      updated_at: attr.updated_at
    }));

    return res.status(200).json({
      message: "Attributes retrieved successfully",
      data: formattedAttributes,
    });
  } catch (error) {
    console.error("Database error in getAllAttributes:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const addAttribute = async (req, res) => {
  const { name, slug, display_order = 0, applicable_product_types = [], product_types } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: "Attribute name is required." });
  }

  // Handle both field names: product_types (from frontend) and applicable_product_types
  let productTypesArray = applicable_product_types || product_types || [];

  // Validate product types
  if (!Array.isArray(productTypesArray)) {
    return res.status(400).json({ error: "Product types must be an array." });
  }

  // Convert string values to numbers and validate
  const numericProductTypes = productTypesArray.map(type => {
    const numType = parseInt(type, 10);
    if (isNaN(numType)) {
      throw new Error(`Invalid product type: ${type}`);
    }
    return numType;
  });

  // Validate product type values (1=Physical, 2=Digital)
  const validProductTypes = [1, 2];
  const invalidTypes = numericProductTypes.filter(type => !validProductTypes.includes(type));
  if (invalidTypes.length > 0) {
    return res.status(400).json({ 
      error: `Invalid product types: ${invalidTypes.join(', ')}. Valid values are 1 (Physical) and 2 (Digital).` 
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO res_product_attributes (name, slug, display_order, applicable_product_types) VALUES (?, ?, ?, ?)`,
      [name, slug, display_order, JSON.stringify(numericProductTypes)]
    );

    res.status(201).json({
      message: "Attribute added successfully",
      attribute_id: result.insertId,
    });
  } catch (error) {
    console.error("Database error in addAttribute:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


const updateAttribute = async (req, res) => {
  const { name, slug, id, display_order, applicable_product_types, product_types } = req.body;

  if (!name || !id) {
    return res.status(400).json({
      error: "Attribute ID and name are required.",
    });
  }

  // Handle both field names: product_types (from frontend) and applicable_product_types
  let productTypesArray = applicable_product_types || product_types;

  // Validate product types if provided
  if (productTypesArray !== undefined) {
    if (!Array.isArray(productTypesArray)) {
      return res.status(400).json({ error: "Product types must be an array." });
    }

    // Convert string values to numbers and validate
    const numericProductTypes = productTypesArray.map(type => {
      const numType = parseInt(type, 10);
      if (isNaN(numType)) {
        throw new Error(`Invalid product type: ${type}`);
      }
      return numType;
    });

    // Validate product type values (1=Physical, 2=Digital)
    const validProductTypes = [1, 2];
    const invalidTypes = numericProductTypes.filter(type => !validProductTypes.includes(type));
    if (invalidTypes.length > 0) {
      return res.status(400).json({ 
        error: `Invalid product types: ${invalidTypes.join(', ')}. Valid values are 1 (Physical) and 2 (Digital).` 
      });
    }

    // Use the converted numeric array
    productTypesArray = numericProductTypes;
  }

  try {
    await pool.execute(
      `UPDATE res_product_attributes SET name = ?, slug = ?, display_order = ?, applicable_product_types = ? WHERE id = ?`,
      [name, slug, display_order || 0, JSON.stringify(productTypesArray || []), id]
    );

    res.status(200).json({
      message: "Attribute updated successfully",
    });
  } catch (error) {
    console.error("Database error in updateAttribute:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteAttribute = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      error: "Attribute ID is required.",
    });
  }

  try {
    await pool.execute(`DELETE FROM res_product_attributes WHERE id = ?`, [id]);

    // delete all values associated with the attribute
    
    await pool.execute(
      `DELETE FROM res_product_attribute_values WHERE attribute_id = ?`,
      [id]
    );

    res.status(200).json({
      message: "Attribute type deleted successfully",
    });
  } catch (error) {
    console.error("Database error in deleteAttribute:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const addAttributeValue = async (req, res) => {
  const { attribute_id, name, slug, description } = req.body;

  if (!attribute_id || !name) {
    return res.status(400).json({
      error: "Attribute ID and value are required.",
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO res_product_attribute_values (attribute_id, name, slug, description) VALUES (?, ?, ?, ?)`,
      [attribute_id, name, slug, description]
    );

    res.status(201).json({
      message: "Attribute value added successfully",
      value_id: result.insertId,
    });
  } catch (error) {
    console.error("Database error in addAttributeValue:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateAttributeValue = async (req, res) => {
  const { name, slug, description, id } = req.body;

  if (!name || !id) {
    return res.status(400).json({
      error: "Attribute value ID and name are required.",
    });
  }

  try {
    await pool.execute(
      `UPDATE res_product_attribute_values SET name = ?, slug = ?, description = ? WHERE id = ?`,
      [name, slug, description, id]
    );

    res.status(200).json({
      message: "Attribute value updated successfully",
    });
  } catch (error) {
    console.error("Database error in updateAttributeValue:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
} 

/**
 * Retrieve all attributes and their associated values
 */
const getAttributesValues = async (req, res) => {
  const { id } = req.params; // Get the attribute type from the URL

  if (!id) {
    return res
      .status(400)
      .json({ error: "Attribute id is required" });
  }

  try {
    // Find the attribute ID and name by its type
    const [attribute] = await pool.execute(
      `SELECT * FROM res_product_attribute_values WHERE attribute_id = ?`,
      [id]
    );

    return res.status(200).json({
      data: attribute,
    });

  } catch (error) {
    console.error("Database error in getAttributeByType:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const deleteAttributeValues = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      error: "Attribute ID is required.",
    });
  }

  try {
    await pool.execute(
      `DELETE FROM res_product_attribute_values WHERE id = ?`,
      [id]
    );

    res.status(200).json({
      message: "Attribute value deleted successfully",
    });
  } catch (error) {
    console.error("Database error in deleteAttributeValues:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}


const updateAttributeDisplayOrder = async (req, res) => {
  const { id, display_order } = req.body;

  if (!id || display_order === undefined) {
    return res.status(400).json({
      error: "Attribute ID and display order are required.",
    });
  }

  // Validate display_order is a number
  if (typeof display_order !== 'number' || display_order < 0) {
    return res.status(400).json({
      error: "Display order must be a non-negative number.",
    });
  }

  try {
    // Check if attribute exists
    const [existingAttribute] = await pool.execute(
      `SELECT id FROM res_product_attributes WHERE id = ?`,
      [id]
    );

    if (existingAttribute.length === 0) {
      return res.status(404).json({
        error: "Attribute not found.",
      });
    }

    // Update display order
    await pool.execute(
      `UPDATE res_product_attributes SET display_order = ? WHERE id = ?`,
      [display_order, id]
    );

    res.status(200).json({
      message: "Attribute display order updated successfully",
    });
  } catch (error) {
    console.error("Database error in updateAttributeDisplayOrder:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const updateMultipleAttributesDisplayOrder = async (req, res) => {
  const { attributes } = req.body;

  if (!Array.isArray(attributes) || attributes.length === 0) {
    return res.status(400).json({
      error: "Attributes array is required and must not be empty.",
    });
  }

  // Validate each attribute object
  for (const attr of attributes) {
    if (!attr.id || attr.display_order === undefined) {
      return res.status(400).json({
        error: "Each attribute must have 'id' and 'display_order' fields.",
      });
    }
    if (typeof attr.display_order !== 'number' || attr.display_order < 0) {
      return res.status(400).json({
        error: "Display order must be a non-negative number for all attributes.",
      });
    }
  }

  try {
    // Get connection from pool for transaction
    const connection = await pool.getConnection();
    
    try {
      // Start transaction
      await connection.beginTransaction();

      // Update each attribute's display order
      for (const attr of attributes) {
        await connection.execute(
          `UPDATE res_product_attributes SET display_order = ? WHERE id = ?`,
          [attr.display_order, attr.id]
        );
      }

      // Commit transaction
      await connection.commit();

      res.status(200).json({
        message: "Multiple attributes display order updated successfully",
        updated_count: attributes.length,
      });
    } catch (error) {
      // Rollback transaction on error
      await connection.rollback();
      throw error;
    } finally {
      // Release connection
      connection.release();
    }
  } catch (error) {
    console.error("Database error in updateMultipleAttributesDisplayOrder:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  addAttribute,
  updateAttribute,
  deleteAttribute,
  addAttributeValue,
  deleteAttributeValues,
  updateAttributeValue,
  getAttributesValues,
  getAllAttributes,
  updateAttributeDisplayOrder,
  updateMultipleAttributesDisplayOrder
};
