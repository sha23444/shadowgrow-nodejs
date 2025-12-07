const { pool } = require("../../config/database");

const offlinePaymentMethodsController = {
  // Get all payment methods for users (public access)
  async getPaymentMethods(req, res) {
    try {
      const [rows] = await pool.execute(
        `SELECT id, category, method_type, title, icon, badge, details, created_at, updated_at
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

      res.status(200).json({
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
      });
    } catch (error) {
      console.error("Get payment methods error:", error);
      res.status(500).json({ 
        success: false,
        error: "Internal Server Error" 
      });
    }
  }
};

module.exports = { offlinePaymentMethodsController };
