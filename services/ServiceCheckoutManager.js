const { pool } = require("../config/database");
const crypto = require("crypto");

const ServiceCheckoutManager = {
  async prepareCheckout({ bookingId, userId }) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [bookingRows] = await connection.execute(
        `SELECT b.*, s.service_name, s.slug, s.service_type, s.thumbnail, s.short_description
         FROM res_service_bookings b
         JOIN res_services s ON s.service_id = b.service_id
         WHERE b.booking_id = ? AND b.user_id = ?`,
        [bookingId, userId]
      );

      if (!bookingRows.length) {
        throw new Error("Booking not found.");
      }

      const booking = bookingRows[0];

      const amount = Number(booking.total_price);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Service price must be greater than zero.");
      }

      if (booking.payment_status !== 'pending') {
        throw new Error("This booking has already been paid.");
      }

      await this.restoreCartSnapshot({ bookingId, userId, connection });

      const [cartRows] = await connection.execute(
        "SELECT * FROM res_cart WHERE user_id = ?",
        [userId]
      );

      const plainCart = cartRows.map((row) => ({ ...row }));
      const cartSnapshot = plainCart.length ? JSON.stringify(plainCart) : null;
      const checkoutToken = crypto.randomBytes(16).toString('hex');

      await connection.execute(
        `UPDATE res_service_bookings 
         SET cart_snapshot = ?, checkout_token = ?, last_order_id = NULL, updated_at = NOW()
         WHERE booking_id = ?`,
        [cartSnapshot, checkoutToken, bookingId]
      );

      await connection.execute("DELETE FROM res_cart WHERE user_id = ?", [userId]);

      const cartItemId = Number(`7${booking.booking_id}`);
      const meta = {
        type: 'service_booking',
        booking_id: booking.booking_id,
        service_id: booking.service_id,
        service_name: booking.service_name,
      };

      await connection.execute(
        `INSERT INTO res_cart 
          (user_id, item_id, item_type, item_name, sale_price, original_price, quantity, stock, media, meta, min_cart_qty, max_cart_qty, is_active)
         VALUES (?, ?, 7, ?, ?, ?, 1, NULL, ?, ?, 1, 1, 1)`,
        [
          userId,
          cartItemId,
          booking.service_name || 'Service Booking',
          amount,
          amount,
          booking.thumbnail || '',
          JSON.stringify(meta),
        ]
      );

      await connection.commit();

      return {
        checkoutToken,
        booking: {
          booking_id: booking.booking_id,
          service_name: booking.service_name,
          amount,
          currency: booking.currency,
        },
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async restoreCartSnapshot({ bookingId, userId, connection = null }) {
    const db = connection || pool;

    const [rows] = await db.execute(
      "SELECT cart_snapshot FROM res_service_bookings WHERE booking_id = ? AND user_id = ?",
      [bookingId, userId]
    );

    if (!rows.length) {
      return;
    }

    const snapshot = rows[0].cart_snapshot;

    if (!snapshot) {
      return;
    }

    const items = JSON.parse(snapshot || '[]');

    await db.execute("DELETE FROM res_cart WHERE user_id = ?", [userId]);

    if (items.length) {
      const insertQuery = `
        INSERT INTO res_cart
        (user_id, item_id, item_type, item_name, sale_price, original_price, quantity, stock, media, meta, min_cart_qty, max_cart_qty, is_active)
        VALUES ?
      `;

      const values = items.map((item) => [
        item.user_id,
        item.item_id,
        item.item_type,
        item.item_name,
        item.sale_price,
        item.original_price,
        item.quantity,
        item.stock,
        item.media,
        item.meta,
        item.min_cart_qty || 1,
        item.max_cart_qty || 1,
        item.is_active ?? 1,
      ]);

      await db.query(insertQuery, [values]);
    }

    await db.execute(
      "UPDATE res_service_bookings SET cart_snapshot = NULL, checkout_token = NULL WHERE booking_id = ? AND user_id = ?",
      [bookingId, userId]
    );
  },

  async handleOrderCreated({ orderId, userId, serviceItems, connection }) {
    if (!serviceItems.length) return;

    for (const item of serviceItems) {
      let bookingId = null;

      if (item.meta) {
        try {
          const meta = JSON.parse(item.meta);
          bookingId = meta?.booking_id || null;
        } catch (error) {
          bookingId = null;
        }
      }

      if (!bookingId) {
        continue;
      }

      await connection.execute(
        `UPDATE res_service_bookings 
         SET last_order_id = ?, updated_at = NOW()
         WHERE booking_id = ? AND user_id = ?`,
        [orderId, bookingId, userId]
      );

      await this.restoreCartSnapshot({ bookingId, userId, connection });
    }
  },

  async markPaymentByOrder(orderId, userId, connection = null) {
    const db = connection || pool;
    const [rows] = await db.execute(
      "SELECT booking_id FROM res_service_bookings WHERE last_order_id = ? AND user_id = ?",
      [orderId, userId]
    );

    if (!rows.length) {
      return null;
    }

    const bookingId = rows[0].booking_id;

    await db.execute(
      `UPDATE res_service_bookings 
       SET payment_status = 'paid', booking_status = 'confirmed', updated_at = NOW()
       WHERE booking_id = ?`,
      [bookingId]
    );

    return bookingId;
  },
};

module.exports = ServiceCheckoutManager;

