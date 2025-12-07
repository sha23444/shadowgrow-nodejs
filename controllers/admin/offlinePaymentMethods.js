const { pool } = require("../../config/database");

const offlinePaymentMethodsController = {
  // Single API to display all payment methods in organized format
  async displayAll(req, res) {
    try {
      const [rows] = await pool.execute(
        `SELECT id, category, method_type, title, icon, badge, details, is_active, created_at, updated_at
         FROM payment_methods
         WHERE is_active = 1
         ORDER BY category, method_type`
      );

      // Group payment methods by category
      const groupedMethods = {};
      rows.forEach(method => {
        const { category, method_type, ...methodData } = method;
        
        if (!groupedMethods[category]) {
          groupedMethods[category] = {};
        }
        
        groupedMethods[category][method_type] = {
          id: methodData.id,
          title: methodData.title,
          icon: methodData.icon,
          badge: methodData.badge,
          category: methodData.category,
          details: JSON.parse(methodData.details),
          created_at: methodData.created_at,
          updated_at: methodData.updated_at
        };
      });

      // Create a clean display format
      const displayData = {
        success: true,
        message: "Payment methods retrieved successfully",
        data: {
          indian: groupedMethods.indian || {},
          worldwide: groupedMethods.worldwide || {},
          summary: {
            total_methods: rows.length,
            indian_count: Object.keys(groupedMethods.indian || {}).length,
            worldwide_count: Object.keys(groupedMethods.worldwide || {}).length
          }
        },
        timestamp: new Date().toISOString()
      };

      res.status(200).json(displayData);
    } catch (error) {
      console.error("Display payment methods error:", error);
      res.status(500).json({ 
        success: false,
        error: "Internal Server Error" 
      });
    }
  },

  // Get all payment methods grouped by category (including inactive)
  async getAll(req, res) {
    try {
      const [rows] = await pool.execute(
        `SELECT id, category, method_type, title, icon, badge, details, is_active, created_at, updated_at
         FROM payment_methods
         ORDER BY category, method_type`
      );

      // Group payment methods by category
      const groupedMethods = {};
      rows.forEach(method => {
        const { category, method_type, ...methodData } = method;
        
        if (!groupedMethods[category]) {
          groupedMethods[category] = {};
        }
        
        groupedMethods[category][method_type] = {
          id: methodData.id,
          title: methodData.title,
          icon: methodData.icon,
          badge: methodData.badge,
          category: methodData.category,
          details: JSON.parse(methodData.details),
          is_active: methodData.is_active,
          created_at: methodData.created_at,
          updated_at: methodData.updated_at
        };
      });

      res.status(200).json({
        success: true,
        data: groupedMethods,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Get all payment methods error:", error);
      res.status(500).json({ 
        success: false,
        error: "Internal Server Error" 
      });
    }
  },

  // Get payment methods by category (including inactive)
  async getByCategory(req, res) {
    try {
      const { category } = req.params;
      
      if (!['indian', 'worldwide'].includes(category)) {
        return res.status(400).json({
          success: false,
          error: "Invalid category. Must be 'indian' or 'worldwide'"
        });
      }

      const [rows] = await pool.execute(
        `SELECT id, category, method_type, title, icon, badge, details, is_active, created_at, updated_at
         FROM payment_methods
         WHERE category = ?
         ORDER BY method_type`,
        [category]
      );

      const methods = {};
      rows.forEach(method => {
        const { method_type, ...methodData } = method;
        
        methods[method_type] = {
          id: methodData.id,
          title: methodData.title,
          icon: methodData.icon,
          badge: methodData.badge,
          category: methodData.category,
          details: JSON.parse(methodData.details),
          is_active: methodData.is_active,
          created_at: methodData.created_at,
          updated_at: methodData.updated_at
        };
      });

      res.status(200).json({
        success: true,
        data: methods,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Get payment methods by category error:", error);
      res.status(500).json({ 
        success: false,
        error: "Internal Server Error" 
      });
    }
  },

  // Get single payment method (including inactive)
  async getById(req, res) {
    try {
      const { category, methodType } = req.params;
      
      if (!['indian', 'worldwide'].includes(category)) {
        return res.status(400).json({
          success: false,
          error: "Invalid category. Must be 'indian' or 'worldwide'"
        });
      }

      const [rows] = await pool.execute(
        `SELECT id, category, method_type, title, icon, badge, details, is_active, created_at, updated_at
         FROM payment_methods
         WHERE category = ? AND method_type = ?`,
        [category, methodType]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Payment method not found"
        });
      }

      const method = rows[0];
      res.status(200).json({
        success: true,
        data: {
          id: method.id,
          title: method.title,
          icon: method.icon,
          badge: method.badge,
          category: method.category,
          details: JSON.parse(method.details),
          is_active: method.is_active,
          created_at: method.created_at,
          updated_at: method.updated_at
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Get payment method by ID error:", error);
      res.status(500).json({ 
        success: false,
        error: "Internal Server Error" 
      });
    }
  },

  // Create new payment method
  async create(req, res) {
    try {
      const { category, methodType, paymentMethod } = req.body;

      // Validate required fields
      if (!category || !methodType || !paymentMethod) {
        return res.status(400).json({
          success: false,
          error: "Category, methodType, and paymentMethod are required"
        });
      }

      if (!['indian', 'worldwide'].includes(category)) {
        return res.status(400).json({
          success: false,
          error: "Invalid category. Must be 'indian' or 'worldwide'"
        });
      }

      // Check if payment method already exists
      const [existing] = await pool.execute(
        `SELECT id, is_active FROM payment_methods WHERE category = ? AND method_type = ?`,
        [category, methodType]
      );

      if (existing.length > 0) {
        const existingMethod = existing[0];
        
        // If the existing method is inactive, reactivate it instead of creating a new one
        if (existingMethod.is_active === 0) {
          // Update the existing inactive method
          await pool.execute(
            `UPDATE payment_methods 
             SET title = ?, icon = ?, badge = ?, details = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
             WHERE category = ? AND method_type = ?`,
            [
              paymentMethod.title,
              paymentMethod.icon,
              paymentMethod.badge,
              JSON.stringify(paymentMethod.details),
              category,
              methodType
            ]
          );

          // Get the updated payment method
          const [updated] = await pool.execute(
            `SELECT id, category, method_type, title, icon, badge, details, is_active, created_at, updated_at
             FROM payment_methods WHERE category = ? AND method_type = ?`,
            [category, methodType]
          );

          const method = updated[0];
          return res.status(200).json({
            success: true,
            message: "Payment method reactivated and updated successfully",
            data: {
              id: method.id,
              title: method.title,
              icon: method.icon,
              badge: method.badge,
              category: method.category,
              details: JSON.parse(method.details),
              is_active: method.is_active,
              created_at: method.created_at,
              updated_at: method.updated_at
            },
            timestamp: new Date().toISOString()
          });
        } else {
          return res.status(409).json({
            success: false,
            error: "Payment method already exists for this category and type"
          });
        }
      }

      // Insert new payment method
      const [result] = await pool.execute(
        `INSERT INTO payment_methods (id, category, method_type, title, icon, badge, details, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentMethod.id,
          category,
          methodType,
          paymentMethod.title,
          paymentMethod.icon,
          paymentMethod.badge,
          JSON.stringify(paymentMethod.details),
          paymentMethod.is_active !== undefined ? paymentMethod.is_active : 1
        ]
      );

      // Get the created payment method
      const [created] = await pool.execute(
        `SELECT id, category, method_type, title, icon, badge, details, is_active, created_at, updated_at
         FROM payment_methods WHERE id = ?`,
        [paymentMethod.id]
      );

      const method = created[0];
      res.status(201).json({
        success: true,
        data: {
          id: method.id,
          title: method.title,
          icon: method.icon,
          badge: method.badge,
          category: method.category,
          details: JSON.parse(method.details),
          is_active: method.is_active,
          created_at: method.created_at,
          updated_at: method.updated_at
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Create payment method error:", error);
      res.status(500).json({ 
        success: false,
        error: "Internal Server Error" 
      });
    }
  },

  // Update payment method
  async update(req, res) {
    try {
      const { category, methodType } = req.params;
      const { title, icon, badge, details } = req.body;

      if (!['indian', 'worldwide'].includes(category)) {
        return res.status(400).json({
          success: false,
          error: "Invalid category. Must be 'indian' or 'worldwide'"
        });
      }

      // Check if at least one field is provided for update
      if (!title && !icon && !badge && !details) {
        return res.status(400).json({
          success: false,
          error: "At least one field (title, icon, badge, or details) is required for update"
        });
      }

      // Check if payment method exists
      const [existing] = await pool.execute(
        `SELECT id FROM payment_methods WHERE category = ? AND method_type = ? AND is_active = 1`,
        [category, methodType]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Payment method not found"
        });
      }

      // Build dynamic update query based on provided fields
      const updateFields = [];
      const updateValues = [];

      if (title !== undefined) {
        updateFields.push('title = ?');
        updateValues.push(title);
      }

      if (icon !== undefined) {
        updateFields.push('icon = ?');
        updateValues.push(icon);
      }

      if (badge !== undefined) {
        updateFields.push('badge = ?');
        updateValues.push(badge);
      }

      if (details !== undefined) {
        updateFields.push('details = ?');
        updateValues.push(JSON.stringify(details));
      }

      // Add updated_at timestamp
      updateFields.push('updated_at = CURRENT_TIMESTAMP');

      // Add WHERE clause parameters
      updateValues.push(category, methodType);

      // Execute update
      await pool.execute(
        `UPDATE payment_methods 
         SET ${updateFields.join(', ')}
         WHERE category = ? AND method_type = ?`,
        updateValues
      );

      // Get updated payment method
      const [updated] = await pool.execute(
        `SELECT id, category, method_type, title, icon, badge, details, is_active, created_at, updated_at
         FROM payment_methods WHERE category = ? AND method_type = ?`,
        [category, methodType]
      );

      const method = updated[0];
      res.status(200).json({
        success: true,
        message: "Payment method updated successfully",
        data: {
          id: method.id,
          title: method.title,
          icon: method.icon,
          badge: method.badge,
          category: method.category,
          details: JSON.parse(method.details),
          is_active: method.is_active,
          created_at: method.created_at,
          updated_at: method.updated_at
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Update payment method error:", error);
      res.status(500).json({ 
        success: false,
        error: "Internal Server Error" 
      });
    }
  },

  // Delete payment method (hard delete)
  async delete(req, res) {
    try {
      const { category, methodType } = req.params;

      if (!['indian', 'worldwide'].includes(category)) {
        return res.status(400).json({
          success: false,
          error: "Invalid category. Must be 'indian' or 'worldwide'"
        });
      }

      // Check if payment method exists (including inactive ones)
      const [existing] = await pool.execute(
        `SELECT id, title, icon, badge FROM payment_methods WHERE category = ? AND method_type = ?`,
        [category, methodType]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Payment method not found"
        });
      }

      const deletedMethod = existing[0];

      // Hard delete (permanently remove from database)
      await pool.execute(
        `DELETE FROM payment_methods WHERE category = ? AND method_type = ?`,
        [category, methodType]
      );

      res.status(200).json({
        success: true,
        message: "Payment method permanently deleted successfully",
        data: {
          deletedMethod: {
            id: deletedMethod.id,
            title: deletedMethod.title,
            icon: deletedMethod.icon,
            badge: deletedMethod.badge,
            category: category,
            methodType: methodType
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Delete payment method error:", error);
      res.status(500).json({ 
        success: false,
        error: "Internal Server Error" 
      });
    }
  },

  // Toggle payment method status
  async toggleStatus(req, res) {
    try {
      const { category, methodType } = req.params;
      const { is_active } = req.body;

      if (!['indian', 'worldwide'].includes(category)) {
        return res.status(400).json({
          success: false,
          error: "Invalid category. Must be 'indian' or 'worldwide'"
        });
      }

      if (typeof is_active !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: "is_active must be a boolean value"
        });
      }

      // Check if payment method exists
      const [existing] = await pool.execute(
        `SELECT id, is_active FROM payment_methods WHERE category = ? AND method_type = ?`,
        [category, methodType]
      );

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Payment method not found"
        });
      }

      const currentStatus = existing[0].is_active;
      
      // If trying to set the same status, return current data
      if (currentStatus === (is_active ? 1 : 0)) {
        const [current] = await pool.execute(
          `SELECT id, category, method_type, title, icon, badge, details, is_active, created_at, updated_at
           FROM payment_methods WHERE category = ? AND method_type = ?`,
          [category, methodType]
        );

        const method = current[0];
        return res.status(200).json({
          success: true,
          message: `Payment method is already ${is_active ? 'active' : 'inactive'}`,
          data: {
            id: method.id,
            title: method.title,
            icon: method.icon,
            badge: method.badge,
            category: method.category,
            details: JSON.parse(method.details),
            is_active: method.is_active,
            created_at: method.created_at,
            updated_at: method.updated_at
          },
          timestamp: new Date().toISOString()
        });
      }

      // Update status
      await pool.execute(
        `UPDATE payment_methods 
         SET is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE category = ? AND method_type = ?`,
        [is_active ? 1 : 0, category, methodType]
      );

      // Get updated payment method
      const [updated] = await pool.execute(
        `SELECT id, category, method_type, title, icon, badge, details, is_active, created_at, updated_at
         FROM payment_methods WHERE category = ? AND method_type = ?`,
        [category, methodType]
      );

      const method = updated[0];
      res.status(200).json({
        success: true,
        message: `Payment method ${is_active ? 'activated' : 'deactivated'} successfully`,
        data: {
          id: method.id,
          title: method.title,
          icon: method.icon,
          badge: method.badge,
          category: method.category,
          details: JSON.parse(method.details),
          is_active: method.is_active,
          created_at: method.created_at,
          updated_at: method.updated_at
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Toggle payment method status error:", error);
      res.status(500).json({ 
        success: false,
        error: "Internal Server Error" 
      });
    }
  }
};

module.exports = { offlinePaymentMethodsController };
