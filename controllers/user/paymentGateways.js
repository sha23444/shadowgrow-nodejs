const { pool } = require("../../config/database");

async function getPaymentMethod(req, res) {
  try {
    const [paymentMethods] = await pool.execute(
      "SELECT gateway_id, name, description, payment_method, public_key, position, icon, gateway_type, key_type, is_default, allowed_currencies FROM payment_gateways WHERE status = 1 AND gateway_type != 'free_order' ORDER BY is_default DESC, position ASC");

    if (paymentMethods.length === 0) {
      return res.status(404).json({ error: "No payment methods found" });
    }

    // Parse allowed_currencies from JSON string to array
    const processedPaymentMethods = paymentMethods.map(method => ({
      ...method,
      allowed_currencies: method.allowed_currencies ? JSON.parse(method.allowed_currencies) : null
    }));

    res.status(200).json({ status: "success", data: processedPaymentMethods });

  }
    catch (error) {
        console.error("Error fetching payment methods:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}

module.exports = {
  getPaymentMethod,
};


