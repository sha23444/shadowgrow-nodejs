const { pool } = require("../../config/database");
const { ErrorLogger } = require("../../logger");

async function getActivePaymentGateways(req, res) {
  try {

    const [gateways] = await pool.query("SELECT * FROM payment_gateways WHERE status = 1 AND gateway_type != 'free_order' ORDER BY is_default DESC, position ASC ");

    // Parse allowed_currencies JSON for each gateway
    const gatewaysWithParsedCurrencies = gateways.map(gateway => ({
      ...gateway,
      allowed_currencies: gateway.allowed_currencies ? JSON.parse(gateway.allowed_currencies) : null
    }));

    res.status(200).json({ gateways: gatewaysWithParsedCurrencies });
  } catch (error) {
    // console.error("Error fetching payment gateways:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }

}

async function getAllPaymentGateways(req, res) {
  
  try {
    const { status } = req.query;
    const [gateways] = await pool.query("SELECT * FROM payment_gateways WHERE status = ? AND gateway_type != 'free_order' ORDER BY is_default DESC, position ASC", [status]);

    // Parse allowed_currencies JSON for each gateway
    const gatewaysWithParsedCurrencies = gateways.map(gateway => ({
      ...gateway,
      allowed_currencies: gateway.allowed_currencies ? JSON.parse(gateway.allowed_currencies) : null
    }));

    res.status(200).json({ gateways: gatewaysWithParsedCurrencies });
  } catch (error) {
    // console.error("Error fetching payment gateways:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function installPaymentGateway(req, res) {
  try {
    const { gateway_id, public_key, secret_key, status = 1 } = req.body;

    // Validate required parameters
    if (!gateway_id || !public_key || !secret_key) {
      return res.status(400).json({ error: "Gateway ID, public key, and secret key are required" });
    }

    const [gateway] = await pool.query("SELECT * FROM payment_gateways WHERE gateway_id = ?", [gateway_id]);

    if (gateway.length === 0) {
      return res.status(404).json({ error: "Payment gateway not found" });
    }

    if (gateway[0].status === 1) {
      return res.status(400).json({ error: "Payment gateway already installed" });
    }

    const [install] = await pool.query("UPDATE payment_gateways SET public_key = ?, secret_key = ?, status = ? WHERE gateway_id = ?", [public_key, secret_key, status, gateway_id]);

    if (install.affectedRows === 0) {
      return res.status(400).json({ error: "Failed to install payment gateway" });
    }

    res.status(200).json({ message: "Payment gateway installed successfully" });

  } catch (error) {
    // console.error("Error installing payment gateway:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function updatePaymentGateway(req, res) {
  try {
    const { gateway_id, public_key, secret_key, status, icon, name, description, extra_config, allowed_currencies } = req.body;

    // Validate required parameters
    if (!gateway_id) {
      return res.status(400).json({ error: "Gateway ID is required" });
    }

    const [gateway] = await pool.query("SELECT * FROM payment_gateways WHERE gateway_id = ?", [gateway_id]);

    if (gateway.length === 0) {
      return res.status(404).json({ error: "Payment gateway not found" });
    }

    // Build dynamic update query based on provided fields
    const updateFields = [];
    const updateValues = [];

    // Only update fields that are provided (not undefined)
    if (public_key !== undefined) {
      updateFields.push('public_key = ?');
      updateValues.push(public_key);
    }

    if (secret_key !== undefined) {
      updateFields.push('secret_key = ?');
      updateValues.push(secret_key);
    }

    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (icon !== undefined) {
      updateFields.push('icon = ?');
      updateValues.push(icon);
    }

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }

    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }

    if (extra_config !== undefined) {
      updateFields.push('extra_config = ?');
      updateValues.push(extra_config || null);
    }

    // Handle allowed_currencies validation and update
    if (allowed_currencies !== undefined) {
      let allowedCurrenciesJson = null;
      if (allowed_currencies === null) {
        allowedCurrenciesJson = null;
      } else if (Array.isArray(allowed_currencies)) {
        // Validate that all items are strings
        if (allowed_currencies.every(currency => typeof currency === 'string')) {
          allowedCurrenciesJson = JSON.stringify(allowed_currencies);
        } else {
          return res.status(400).json({ error: "All currencies must be strings" });
        }
      } else {
        return res.status(400).json({ error: "allowed_currencies must be an array of strings or null" });
      }
      
      updateFields.push('allowed_currencies = ?');
      updateValues.push(allowedCurrenciesJson);
    }

    // Add updated_at timestamp
    updateFields.push('updated_at = NOW()');

    // Add gateway_id for WHERE clause
    updateValues.push(gateway_id);

    // Check if at least one field is provided for update
    if (updateFields.length === 1) { // Only updated_at timestamp
      return res.status(400).json({ error: "At least one field must be provided for update" });
    }

    // Execute dynamic update query
    const updateQuery = `UPDATE payment_gateways SET ${updateFields.join(', ')} WHERE gateway_id = ?`;
    const [update] = await pool.query(updateQuery, updateValues);

    // Check if the query executed successfully
    if (update.affectedRows < 0) {
      return res.status(400).json({ error: "Failed to update payment gateway" });
    }

    res.status(200).json({ 
      message: "Payment gateway updated successfully",
      updatedFields: updateFields.filter(field => field !== 'updated_at = NOW()')
    });

  } catch (error) {
    console.error("Error updating payment gateway:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function uninstallPaymentGateway(req, res) {
  try {
    const { gateway_id } = req.body;

    // Validate required parameter
    if (!gateway_id) {
      return res.status(400).json({ error: "Gateway ID is required" });
    }

    // Check if the gateway exists and get its current status
    const [gateway] = await pool.query("SELECT * FROM payment_gateways WHERE gateway_id = ?", [gateway_id]);
    
    if (gateway.length === 0) {
      return res.status(404).json({ error: "Payment gateway not found" });
    }

    if (gateway[0].status === 0) {
      return res.status(400).json({ error: "Payment gateway already uninstalled" });
    }

    const [uninstall] = await pool.query("UPDATE payment_gateways SET status = 0 WHERE gateway_id = ?", [gateway_id]);

    if (uninstall.affectedRows === 0) {
      return res.status(400).json({ error: "Failed to uninstall payment gateway" });
    }

    res.status(200).json({ message: "Payment gateway uninstalled successfully" });

  } catch (error) {
    // console.error("Error uninstalling payment gateway:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function setDefaultPaymentGateway(req, res) {
  try {
    const { gateway_id } = req.body;

    // Validate required parameter
    if (!gateway_id) {
      return res.status(400).json({ error: "Gateway ID is required" });
    }

    // Check if the gateway exists
    const [gateway] = await pool.query("SELECT * FROM payment_gateways WHERE gateway_id = ?", [gateway_id]);
    
    if (gateway.length === 0) {
      return res.status(404).json({ error: "Payment gateway not found" });
    }

    // Start a transaction to ensure atomicity
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // First set all other payment gateways to not default
      await connection.query("UPDATE payment_gateways SET is_default = 0");

      // Get all gateways ordered by current position
      const [allGateways] = await connection.query(
        "SELECT gateway_id, position FROM payment_gateways ORDER BY position ASC"
      );

      // Remove the target gateway from the list
      const otherGateways = allGateways.filter(gw => gw.gateway_id !== gateway_id);

      // Create new position mapping - set target gateway to position 1
      const newPositions = [];
      
      // Set the target gateway to position 1 and default
      newPositions.push({
        gateway_id: gateway_id,
        new_position: 1,
        is_default: 1
      });

      // Adjust positions for other gateways (shift them down by 1)
      let currentPos = 2;
      for (const gateway of otherGateways) {
        newPositions.push({
          gateway_id: gateway.gateway_id,
          new_position: currentPos,
          is_default: 0
        });
        currentPos++;
      }

      // Update all positions and default status
      for (const pos of newPositions) {
        await connection.query(
          "UPDATE payment_gateways SET position = ?, is_default = ?, updated_at = NOW() WHERE gateway_id = ?",
          [pos.new_position, pos.is_default, pos.gateway_id]
        );
      }

      // Commit the transaction
      await connection.commit();

      // Get updated gateway information
      const [updatedGateway] = await connection.query(
        "SELECT gateway_id, name, gateway_type, position, is_default, status FROM payment_gateways WHERE gateway_id = ?", 
        [gateway_id]
      );

      // Get all gateways with their new positions for response
      const [allUpdatedGateways] = await connection.query(
        "SELECT gateway_id, name, gateway_type, position, is_default, status FROM payment_gateways ORDER BY is_default DESC, position ASC"
      );

      res.status(200).json({ 
        status: "success",
        message: "Default payment gateway set successfully and moved to position 1",
        data: {
          updated_gateway: {
            gateway_id: updatedGateway[0].gateway_id,
            name: updatedGateway[0].name,
            gateway_type: updatedGateway[0].gateway_type,
            position: updatedGateway[0].position,
            is_default: updatedGateway[0].is_default,
            status: updatedGateway[0].status
          },
          all_gateways: allUpdatedGateways.map(gw => ({
            gateway_id: gw.gateway_id,
            name: gw.name,
            gateway_type: gw.gateway_type,
            position: gw.position,
            is_default: gw.is_default,
            status: gw.status
          }))
        }
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
    // console.error("Error setting default payment gateway:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

async function updateAllowedCurrencies(req, res) {
  try {
    const { gateway_id, allowed_currencies } = req.body;

    // Validate required parameters
    if (!gateway_id) {
      return res.status(400).json({ 
        status: "fail",
        message: "Gateway ID is required" 
      });
    }

    // Validate allowed_currencies
    let allowedCurrenciesJson = null;
    if (allowed_currencies !== undefined) {
      if (allowed_currencies === null) {
        allowedCurrenciesJson = null;
      } else if (Array.isArray(allowed_currencies)) {
        // Validate that all items are strings
        if (allowed_currencies.every(currency => typeof currency === 'string')) {
          allowedCurrenciesJson = JSON.stringify(allowed_currencies);
        } else {
          return res.status(400).json({ 
            status: "fail",
            message: "All currencies must be strings" 
          });
        }
      } else {
        return res.status(400).json({ 
          status: "fail",
          message: "allowed_currencies must be an array of strings or null" 
        });
      }
    } else {
      return res.status(400).json({ 
        status: "fail",
        message: "allowed_currencies is required" 
      });
    }

    // Check if the gateway exists
    const [gateway] = await pool.query("SELECT * FROM payment_gateways WHERE gateway_id = ?", [gateway_id]);
    
    if (gateway.length === 0) {
      return res.status(404).json({ 
        status: "fail",
        message: "Payment gateway not found" 
      });
    }

    // Update the allowed currencies
    const [update] = await pool.query(
      "UPDATE payment_gateways SET allowed_currencies = ?, updated_at = NOW() WHERE gateway_id = ?", 
      [allowedCurrenciesJson, gateway_id]
    );

    if (update.affectedRows === 0) {
      return res.status(400).json({ 
        status: "fail",
        message: "Failed to update allowed currencies" 
      });
    }

    // Get the updated gateway information
    const [updatedGateway] = await pool.query(
      "SELECT gateway_id, name, gateway_type, allowed_currencies FROM payment_gateways WHERE gateway_id = ?", 
      [gateway_id]
    );

    return res.status(200).json({ 
      status: "success",
      message: "Allowed currencies updated successfully",
      data: {
        gateway_id: updatedGateway[0].gateway_id,
        name: updatedGateway[0].name,
        gateway_type: updatedGateway[0].gateway_type,
        allowed_currencies: updatedGateway[0].allowed_currencies ? JSON.parse(updatedGateway[0].allowed_currencies) : null
      }
    });

  } catch (error) {
    // console.error("Error updating allowed currencies:", error);
    await ErrorLogger.logError({
      errorType: 'payment_gateway',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      endpoint: '/admin/payment-gateways/update-allowed-currencies'
    });

    return res.status(500).json({ 
      status: "fail",
      message: "Internal Server Error",
      error: error.message
    });
  }
}

async function changeOrderPosition(req, res) {
  try {
    const { gateway_id, new_position } = req.body;

    // Validate required parameters
    if (!gateway_id || new_position === undefined || new_position === null) {
      return res.status(400).json({ 
        status: "fail",
        message: "Gateway ID and new_position are required" 
      });
    }

    // Validate position is a non-negative integer (allowing 0)
    if (!Number.isInteger(new_position) || new_position < 0) {
      return res.status(400).json({ 
        status: "fail",
        message: "new_position must be a non-negative integer (0 or greater)" 
      });
    }

    // Check if the gateway exists
    const [gateway] = await pool.query("SELECT * FROM payment_gateways WHERE gateway_id = ?", [gateway_id]);
    
    if (gateway.length === 0) {
      return res.status(404).json({ 
        status: "fail",
        message: "Payment gateway not found" 
      });
    }

    // Get current position of the gateway
    const currentPosition = gateway[0].position;

    // If position is the same, no need to update
    if (currentPosition === new_position) {
      return res.status(200).json({ 
        status: "success",
        message: "Position is already set to the requested value",
        data: {
          gateway_id,
          position: currentPosition
        }
      });
    }

    // Start a transaction to ensure atomicity
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Get all gateways ordered by current position
      const [allGateways] = await connection.query(
        "SELECT gateway_id, position FROM payment_gateways ORDER BY position ASC"
      );

      // Remove the target gateway from the list
      const otherGateways = allGateways.filter(gw => gw.gateway_id !== gateway_id);

      // Create new position mapping
      const newPositions = [];
      
      // Insert the target gateway at the new position
      newPositions.push({
        gateway_id: gateway_id,
        new_position: new_position
      });

      // Adjust positions for other gateways
      let currentPos = 1;
      for (const gateway of otherGateways) {
        if (currentPos === new_position) {
          currentPos++; // Skip the position we're inserting into
        }
        newPositions.push({
          gateway_id: gateway.gateway_id,
          new_position: currentPos
        });
        currentPos++;
      }

      // Update all positions
      for (const pos of newPositions) {
        await connection.query(
          "UPDATE payment_gateways SET position = ?, updated_at = NOW() WHERE gateway_id = ?",
          [pos.new_position, pos.gateway_id]
        );
      }

      // Commit the transaction
      await connection.commit();

      // Get updated gateway information
      const [updatedGateway] = await connection.query(
        "SELECT gateway_id, name, gateway_type, position, status FROM payment_gateways WHERE gateway_id = ?", 
        [gateway_id]
      );

      // Get all gateways with their new positions for response
      const [allUpdatedGateways] = await connection.query(
        "SELECT gateway_id, name, gateway_type, position, status FROM payment_gateways ORDER BY position ASC"
      );

      res.status(200).json({ 
        status: "success",
        message: "Payment gateway position updated successfully",
        data: {
          updated_gateway: {
            gateway_id: updatedGateway[0].gateway_id,
            name: updatedGateway[0].name,
            gateway_type: updatedGateway[0].gateway_type,
            old_position: currentPosition,
            new_position: new_position,
            status: updatedGateway[0].status
          },
          all_gateways: allUpdatedGateways.map(gw => ({
            gateway_id: gw.gateway_id,
            name: gw.name,
            gateway_type: gw.gateway_type,
            position: gw.position,
            status: gw.status
          }))
        }
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
    // console.error("Error changing payment gateway position:", error);
    await ErrorLogger.logError({
      errorType: 'payment_gateway',
      errorLevel: 'error',
      errorMessage: error.message,
      errorDetails: error,
      endpoint: '/admin/payment-gateways/change-position'
    });

    return res.status(500).json({ 
      status: "fail",
      message: "Internal Server Error",
      error: error.message
    });
  }
}

module.exports = {
  getActivePaymentGateways,
  getAllPaymentGateways,
  installPaymentGateway,
  updatePaymentGateway,
  uninstallPaymentGateway,
  setDefaultPaymentGateway,
  changeOrderPosition,
  updateAllowedCurrencies
};
