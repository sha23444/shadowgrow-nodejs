const { pool } = require("../../config/database");

async function getTaxes(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { status, type, tax_type, gateway_id } = req.query;

    // Build WHERE clause for filtering
    let whereClause = '';
    const queryParams = [];
    
    if (status) {
      whereClause += whereClause ? ' AND is_active = ?' : 'WHERE is_active = ?';
      queryParams.push(status);
    }
    
    if (type) {
      whereClause += whereClause ? ' AND calculation_type = ?' : 'WHERE calculation_type = ?';
      queryParams.push(type);
    }

    if (tax_type) {
      whereClause += whereClause ? ' AND tax_type = ?' : 'WHERE tax_type = ?';
      queryParams.push(tax_type);
    }

    if (gateway_id) {
      whereClause += whereClause ? ' AND gateway_id = ?' : 'WHERE gateway_id = ?';
      queryParams.push(gateway_id);
    }

    // Fetch paginated taxes with gateway info for payment gateway taxes
    const query = `
      SELECT 
        t.id, 
        t.name, 
        t.code,
        t.tax_type,
        t.gateway_id,
        pg.name as gateway_name,
        pg.gateway_type,
        pg.icon,
        t.calculation_type as type, 
        t.value, 
        t.description, 
        t.is_active, 
        t.created_at, 
        t.updated_at
      FROM taxes t
      LEFT JOIN payment_gateways pg ON t.gateway_id = pg.gateway_id
      ${whereClause}
      ORDER BY t.created_at DESC 
      LIMIT ? OFFSET ?
    `;
    
    queryParams.push(limit, offset);
    const [taxes] = await pool.execute(query, queryParams);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) AS total 
      FROM taxes t
      LEFT JOIN payment_gateways pg ON t.gateway_id = pg.gateway_id
      ${whereClause}
    `;
    const [countResult] = await pool.execute(countQuery, queryParams.slice(0, -2));
    const total = countResult && countResult.length > 0 ? countResult[0].total : 0;

    const result = {
      success: true,
      data: taxes || [],
      pagination: {
        current_page: page,
        per_page: limit,
        total: total,
        last_page: Math.ceil(total / limit)
      }
    };

    res.status(200).json(result);
    } catch (error) {
        console.error("Error fetching taxes:", error);
        
        // Handle specific database errors
        if (error.code === 'ER_NO_SUCH_TABLE') {
            return res.status(500).json({ 
                success: false,
                message: "Database table 'taxes' does not exist. Please contact administrator."
            });
        }
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            return res.status(500).json({ 
                success: false,
                message: "Database access denied. Please contact administrator."
            });
        }
        
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            return res.status(500).json({ 
                success: false,
                message: "Database connection failed. Please try again later."
            });
        }
        
        res.status(500).json({ 
            success: false,
            message: `Failed to fetch taxes: ${error.message}`,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
  }
}

/**
 * Create a new tax
 */
async function createTax(req, res) {
  try {
    const { name, tax_type, gateway_id = null, calculation_type, value, description, is_active = 1, code } = req.body;

    // Validate required fields
    if (!name || !tax_type || !calculation_type || value === undefined || value === null) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, tax_type, calculation_type, and value are required"
      });
    }

    // Auto-generate code if not provided
    let taxCode = code;
    if (!taxCode) {
      // Generate code based on tax type and name
      const prefix = tax_type === 'payment_gateway' ? 'PGW' : 'TAX';
      const nameSlug = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 6);
      const timestamp = Date.now().toString().slice(-4); // Last 4 digits of timestamp
      taxCode = `${prefix}_${nameSlug}_${timestamp}`;
    }

    // Validate tax_type
    if (!['general', 'payment_gateway'].includes(tax_type)) {
      return res.status(400).json({
        success: false,
        message: "Tax type must be either 'general' or 'payment_gateway'"
      });
    }

    // Validate calculation_type
    if (!['percentage', 'fixed', 'tiered'].includes(calculation_type)) {
      return res.status(400).json({
        success: false,
        message: "Calculation type must be either 'percentage', 'fixed', or 'tiered'"
      });
    }

    // Validate value
    if (value < 0 || value > 999999.99) {
      return res.status(400).json({
        success: false,
        message: "Value must be between 0 and 999999.99"
      });
    }

    // For payment gateway taxes, validate gateway_id
    if (tax_type === 'payment_gateway') {
      if (!gateway_id) {
        return res.status(400).json({
          success: false,
          message: "Gateway ID is required for payment gateway taxes"
        });
      }

      // Check if payment gateway exists
      const [gateway] = await pool.execute(
        'SELECT gateway_id, name, gateway_type FROM payment_gateways WHERE gateway_id = ?',
        [gateway_id]
      );

      if (gateway.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Payment gateway not found"
        });
      }
    }

    // Check if tax name already exists for the same tax_type
    let existingTaxQuery = 'SELECT id FROM taxes WHERE name = ? AND tax_type = ?';
    let existingTaxParams = [name, tax_type];
    
    if (tax_type === 'payment_gateway') {
      existingTaxQuery += ' AND gateway_id = ?';
      existingTaxParams.push(gateway_id);
    }

    const [existingTax] = await pool.execute(existingTaxQuery, existingTaxParams);

    if (existingTax.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Tax with this name already exists for this tax type"
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO taxes (name, code, tax_type, gateway_id, calculation_type, value, description, is_active) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, taxCode, tax_type, gateway_id || null, calculation_type, value, description, is_active]
    );

    // Fetch the created tax with gateway info
    const [newTax] = await pool.execute(
      `SELECT 
        t.id, 
        t.name, 
        t.code,
        t.tax_type,
        t.gateway_id,
        pg.name as gateway_name,
        pg.gateway_type,
        t.calculation_type as type, 
        t.value, 
        t.description, 
        t.is_active as status, 
        t.created_at, 
        t.updated_at
      FROM taxes t
      LEFT JOIN payment_gateways pg ON t.gateway_id = pg.gateway_id
      WHERE t.id = ?`,
      [result.insertId]
    );

    if (!newTax || newTax.length === 0) {
      return res.status(500).json({
        success: false,
        message: "Tax was created but could not be retrieved"
      });
    }

    res.status(201).json({
      success: true,
      data: newTax[0],
      message: "Tax created successfully"
    });
  } catch (error) {
    console.error("Error creating tax:", error);
    
    // Handle specific database errors
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: "A tax with this name already exists for this tax type"
      });
    }
    
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({
        success: false,
        message: "Referenced payment gateway does not exist"
      });
    }
    
    if (error.code === 'ER_BAD_NULL_ERROR') {
      return res.status(400).json({
        success: false,
        message: "Required fields cannot be null"
      });
    }
    
    if (error.code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({
        success: false,
        message: "One or more fields exceed maximum length"
      });
    }
    
    res.status(500).json({
      success: false,
      message: `Failed to create tax: ${error.message}`,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

/**
 * Update a tax
 */
async function updateTax(req, res) {
    try {
    const { id } = req.params;
    const { name, tax_type, gateway_id, calculation_type, value, description, is_active, code } = req.body;

    // Check if tax exists
    const [existingTax] = await pool.execute(
      'SELECT * FROM taxes WHERE id = ?',
      [id]
    );

    if (existingTax.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tax not found"
      });
    }

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      // Determine the effective tax_type and gateway_id for conflict checking
      const effectiveTaxType = tax_type !== undefined ? tax_type : existingTax[0].tax_type;
      const effectiveGatewayId = gateway_id !== undefined ? gateway_id : existingTax[0].gateway_id;
      
      // Check if new name conflicts with existing tax
      let nameConflictQuery = 'SELECT id FROM taxes WHERE name = ? AND id != ? AND tax_type = ?';
      let nameConflictParams = [name, id, effectiveTaxType];
      
      if (effectiveTaxType === 'payment_gateway') {
        nameConflictQuery += ' AND gateway_id = ?';
        nameConflictParams.push(effectiveGatewayId);
      }

      const [nameConflict] = await pool.execute(nameConflictQuery, nameConflictParams);
      
      if (nameConflict.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Tax with this name already exists for this tax type"
        });
      }
      
      updateFields.push('name = ?');
      updateValues.push(name);
    }

    if (tax_type !== undefined) {
      if (!['general', 'payment_gateway'].includes(tax_type)) {
        return res.status(400).json({
          success: false,
          message: "Tax type must be either 'general' or 'payment_gateway'"
        });
      }
      
      // If changing to 'general', ensure gateway_id is null
      if (tax_type === 'general') {
        updateFields.push('gateway_id = ?');
        updateValues.push(null);
      }
      
      updateFields.push('tax_type = ?');
      updateValues.push(tax_type);
    }

    if (gateway_id !== undefined) {
      // Determine the effective tax_type (use new value if provided, otherwise existing)
      const effectiveTaxType = tax_type !== undefined ? tax_type : existingTax[0].tax_type;
      
      if (effectiveTaxType === 'payment_gateway') {
        // Check if payment gateway exists
        const [gateway] = await pool.execute(
          'SELECT gateway_id, name, gateway_type FROM payment_gateways WHERE gateway_id = ?',
          [gateway_id]
        );

        if (gateway.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Payment gateway not found"
          });
        }
      } else if (effectiveTaxType === 'general' && gateway_id !== null) {
        return res.status(400).json({
          success: false,
          message: "Gateway ID must be null for general tax type"
        });
      }
      
      updateFields.push('gateway_id = ?');
      updateValues.push(gateway_id || null);
    }

    if (calculation_type !== undefined) {
      if (!['percentage', 'fixed', 'tiered'].includes(calculation_type)) {
        return res.status(400).json({
          success: false,
          message: "Calculation type must be either 'percentage', 'fixed', or 'tiered'"
        });
      }
      updateFields.push('calculation_type = ?');
      updateValues.push(calculation_type);
    }

    if (value !== undefined) {
      if (value < 0 || value > 999999.99) {
        return res.status(400).json({
          success: false,
          message: "Value must be between 0 and 999999.99"
        });
      }
      updateFields.push('value = ?');
      updateValues.push(value);
    }

    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }

    if (code !== undefined) {
      // Check if code already exists for another tax
      const [codeConflict] = await pool.execute(
        'SELECT id FROM taxes WHERE code = ? AND id != ?',
        [code, id]
      );
      
      if (codeConflict.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Tax code already exists"
        });
      }
      
      updateFields.push('code = ?');
      updateValues.push(code);
    }

    if (is_active !== undefined) {
      if (![0, 1].includes(is_active)) {
        return res.status(400).json({
          success: false,
          message: "Status must be either 0 (inactive) or 1 (active)"
        });
      }
      updateFields.push('is_active = ?');
      updateValues.push(is_active);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update"
      });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);

    const [result] = await pool.execute(
      `UPDATE taxes SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    // Fetch updated tax with gateway info
    const [updatedTax] = await pool.execute(
      `SELECT 
        t.id, 
        t.name, 
        t.code,
        t.tax_type,
        t.gateway_id,
        pg.name as gateway_name,
        pg.gateway_type,
        t.calculation_type as type, 
        t.value, 
        t.description, 
        t.is_active as status, 
        t.created_at, 
        t.updated_at
      FROM taxes t
      LEFT JOIN payment_gateways pg ON t.gateway_id = pg.gateway_id
      WHERE t.id = ?`,
      [id]
    );

    if (!updatedTax || updatedTax.length === 0) {
      return res.status(500).json({
        success: false,
        message: "Tax was updated but could not be retrieved"
      });
    }

    res.status(200).json({
      success: true,
      data: updatedTax[0],
      message: "Tax updated successfully"
    });
    } catch (error) {
        console.error("Error updating tax:", error);
        
        // Handle specific database errors
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: "A tax with this name already exists for this tax type"
            });
        }
        
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({
                success: false,
                message: "Referenced payment gateway does not exist"
            });
        }
        
        if (error.code === 'ER_BAD_NULL_ERROR') {
            return res.status(400).json({
                success: false,
                message: "Required fields cannot be null"
            });
        }
        
        if (error.code === 'ER_DATA_TOO_LONG') {
            return res.status(400).json({
                success: false,
                message: "One or more fields exceed maximum length"
            });
        }
        
        res.status(500).json({
            success: false,
            message: `Failed to update tax: ${error.message}`,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
  }
}

/**
 * Delete a tax
 */
async function deleteTax(req, res) {
  try {
    const { id } = req.params;

    // Check if tax exists
    const [existingTax] = await pool.execute(
      'SELECT id FROM taxes WHERE id = ?',
      [id]
    );

    if (existingTax.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tax not found"
      });
    }

    const [deleteResult] = await pool.execute('DELETE FROM taxes WHERE id = ?', [id]);

    if (deleteResult.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Tax not found or already deleted"
      });
    }

    res.status(200).json({
      success: true,
      message: "Tax deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting tax:", error);
    
    // Handle specific database errors
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        success: false,
        message: "Cannot delete tax as it is being used by other records"
      });
    }
    
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        success: false,
        message: "Database table 'taxes' does not exist. Please contact administrator."
      });
    }
    
    res.status(500).json({
      success: false,
      message: `Failed to delete tax: ${error.message}`,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}


/**
 * 
 * Update Status 
 */

async function updateTaxStatus(req, res) {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Tax ID is required"
      });
    }

    if (is_active === undefined || is_active === null) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }

    if (![0, 1].includes(is_active)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 0 (inactive) or 1 (active)"
      });
    }

    // Check if tax exists
    const [existingTax] = await pool.execute(
      'SELECT id FROM taxes WHERE id = ?',
      [id]
    );

    if (existingTax.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tax not found"
      });
    }

    const [updateResult] = await pool.execute('UPDATE taxes SET is_active = ? WHERE id = ?', [is_active, id]);

    if (updateResult.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: "Failed to update tax status"
      });
    }

    res.status(200).json({
      success: true,
      message: "Tax status updated successfully"
    });
  } catch (error) {
    console.error("Error updating tax status:", error);
    
    // Handle specific database errors
    if (error.code === 'ER_BAD_NULL_ERROR') {
      return res.status(400).json({
        success: false,
        message: "Status cannot be null"
      });
    }
    
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        success: false,
        message: "Database table 'taxes' does not exist. Please contact administrator."
      });
    }
    
    res.status(500).json({
      success: false,
      message: `Failed to update tax status: ${error.message}`,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}


module.exports = {
  getTaxes,
  createTax,
  updateTax,
  deleteTax,
  updateTaxStatus
};

