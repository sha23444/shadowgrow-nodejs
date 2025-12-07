const { pool } = require("../../config/database");
const CartCalculator = require("../../services/CartCalculator");
const OrderCalculationService = require("../../services/OrderCalculationService");
const EXCLUSIVE_ITEM_TYPES = new Set([1, 2, 3, 4, 6, 7]);

function deriveVersion(rows) {
  const cnt = rows.length;
  const mx = rows.reduce((m, r) => {
    const t = new Date(r.updated_at || r.created_at || Date.now()).getTime();
    return Math.max(m, t);
  }, 0);
  return `${cnt}-${mx || Date.now()}`;
}

function getExclusiveTypesFromItems(items = []) {
  const types = new Set();
  for (const it of items || []) {
    const t = Number(it?.item_type);
    if (EXCLUSIVE_ITEM_TYPES.has(t)) types.add(t);
  }
  return Array.from(types);
}

/**
 * Recompute prices for guest cart items from source (products table)
 * Same logic as user cart for consistency
 */
async function recomputeGuestCartPrices(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return cartItems;
  }

  const physicalProductIds = [];
  const digitalProductIds = [];
  
  for (const item of cartItems) {
    const itemType = Number(item.item_type);
    if (itemType === 6) {
      physicalProductIds.push(item.item_id);
    } else if (itemType === 3) {
      digitalProductIds.push(item.item_id);
    }
  }

  const priceMap = new Map();
  
  if (physicalProductIds.length > 0 || digitalProductIds.length > 0) {
    const allProductIds = [...new Set([...physicalProductIds, ...digitalProductIds])];
    if (allProductIds.length > 0) {
      const placeholders = allProductIds.map(() => '?').join(',');
      const [products] = await pool.execute(
        `SELECT product_id, sale_price, original_price FROM res_products WHERE product_id IN (${placeholders})`,
        allProductIds
      );
      
      for (const product of products) {
        priceMap.set(Number(product.product_id), {
          sale_price: Number(product.sale_price || 0),
          original_price: Number(product.original_price || product.sale_price || 0),
        });
      }
    }
  }

  const updatedItems = cartItems.map((item) => {
    const itemType = Number(item.item_type);
    const currentPrice = priceMap.get(item.item_id);
    
    if ((itemType === 6 || itemType === 3) && currentPrice) {
      return {
        ...item,
        sale_price: currentPrice.sale_price,
        original_price: currentPrice.original_price,
      };
    }
    
    return item;
  });

  return updatedItems;
}

/**
 * Calculate guest cart totals using CartCalculator (userId is optional)
 */
async function calculateGuestCartTotals(cartItems, currency = 'USD') {
  if (!cartItems || cartItems.length === 0) {
    return {
      subtotal: 0,
      shipping: 0,
      discount: 0,
      tax: 0,
      total: 0,
    };
  }

  try {
    const cartCalculator = new CartCalculator();
    const calculationResult = await cartCalculator.calculateCartTotal({
      cartItems,
      currency,
      discountCode: null,
      paymentGatewayId: null,
      userId: null, // Guest carts don't have userId
    });

    return {
      subtotal: Number((calculationResult.subtotal || 0).toFixed(2)),
      shipping: 0,
      discount: Number((calculationResult.discount?.amount || 0).toFixed(2)),
      tax: Number((calculationResult.tax?.total || 0).toFixed(2)),
      total: Number((calculationResult.total || 0).toFixed(2)),
    };
  } catch (error) {
    // Fallback to simple calculation
    console.error('Error calculating guest cart totals:', error);
    const subtotal = cartItems.reduce((sum, item) => {
      const salePrice = Number(item.sale_price || 0);
      const quantity = Number(item.quantity || 1);
      return sum + (salePrice * quantity);
    }, 0);
    return {
      subtotal: Number(subtotal.toFixed(2)),
      shipping: 0,
      discount: 0,
      tax: 0,
      total: Number(subtotal.toFixed(2)),
    };
  }
}

async function getGuestCart(req, res) {
  try {
    const cartId = req.cartId;
    const [rows] = await pool.execute(
      "SELECT * FROM res_cart_guest WHERE cart_id = ? AND is_active = 1",
      [cartId]
    );
    
    // Recompute prices from source
    const recomputedCart = await recomputeGuestCartPrices(rows);
    
    // Update cart with recomputed prices if changed (async, don't wait)
    if (recomputedCart.length > 0) {
      Promise.all(recomputedCart.map(async (item) => {
        const dbItem = rows.find(db => db.item_id === item.item_id && db.item_type === item.item_type);
        if (dbItem && (Number(dbItem.sale_price) !== item.sale_price || Number(dbItem.original_price) !== item.original_price)) {
          await pool.execute(
            `UPDATE res_cart_guest SET sale_price = ?, original_price = ? WHERE cart_id = ? AND item_id = ? AND item_type = ?`,
            [item.sale_price, item.original_price, cartId, item.item_id, item.item_type]
          );
        }
      })).catch(err => console.error('Error updating guest cart prices:', err));
    }
    
    // Calculate totals
    const currency = req.query.currency || 'USD';
    const totals = await calculateGuestCartTotals(recomputedCart, currency);
    
    return res.status(200).json({
      message: "Guest cart loaded",
      cart: recomputedCart,
      cartVersion: deriveVersion(recomputedCart),
      moduleType: getExclusiveTypesFromItems(recomputedCart)[0] || null,
      totals: totals,
    });
  } catch (e) {
    console.error('Error getting guest cart:', e);
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function syncGuestCart(req, res) {
  const cartId = req.cartId;
  try {
    const { cartItems = [], cartVersion: clientVersion } = req.body || {};
    const [existing] = await pool.execute(
      "SELECT * FROM res_cart_guest WHERE cart_id = ?",
      [cartId]
    );
    const serverVersion = deriveVersion(existing);
    if (clientVersion && clientVersion !== serverVersion) {
      // If server cart is empty, allow sync to proceed (no real conflict)
      // Empty carts can always be replaced
      if (existing.length === 0) {
        // Server cart is empty, proceed with sync - no conflict
        // This allows user to add items even if version mismatch on empty cart
      } else {
        // Server cart has items and version mismatch - return conflict
        // Recompute prices for existing cart before returning conflict
        const recomputedExistingCart = await recomputeGuestCartPrices(existing);
        const existingTotals = await calculateGuestCartTotals(recomputedExistingCart, req.body.currency || req.query.currency || 'USD');
        
        return res.status(409).json({
          message: "Cart version conflict. Refetch required.",
          code: "CART_VERSION_CONFLICT",
          cart: recomputedExistingCart,
          cartVersion: serverVersion,
          moduleType: getExclusiveTypesFromItems(recomputedExistingCart)[0] || null,
          totals: existingTotals,
        });
      }
    }
    // Enforce exclusivity for guest carts too (do not auto-replace)
    const existingTypes = getExclusiveTypesFromItems(existing);
    const incomingTypes = getExclusiveTypesFromItems(cartItems);
    if (existingTypes.length && incomingTypes.length && existingTypes[0] !== incomingTypes[0]) {
      // Recompute prices for existing cart before returning conflict
      const recomputedExistingCart = await recomputeGuestCartPrices(existing);
      const existingTotals = await calculateGuestCartTotals(recomputedExistingCart, req.body.currency || req.query.currency || 'USD');
      
      return res.status(409).json({
        message: "Cart contains a different item type. Replace cart to continue.",
        code: "CART_MODULE_CONFLICT",
        details: { currentType: existingTypes[0], attemptedType: incomingTypes[0] },
        cart: recomputedExistingCart,
        cartVersion: serverVersion,
        moduleType: getExclusiveTypesFromItems(recomputedExistingCart)[0] || null,
        totals: existingTotals,
      });
    }
    // Clear then insert all
    await pool.execute("DELETE FROM res_cart_guest WHERE cart_id = ?", [cartId]);
    if (Array.isArray(cartItems) && cartItems.length) {
      const values = cartItems.map((i) => [
        cartId,
        i.item_id,
        i.item_type,
        i.item_name,
        i.sale_price,
        i.original_price ?? i.sale_price,
        i.quantity ?? 1,
        i.min_cart_qty ?? 1,
        i.max_cart_qty ?? 1,
        i.media || "",
        i.meta || null,
      ]);
      await pool.query(
        `INSERT INTO res_cart_guest 
        (cart_id, item_id, item_type, item_name, sale_price, original_price, quantity, min_cart_qty, max_cart_qty, media, meta)
        VALUES ?`,
        [values]
      );
    }
    const [fresh] = await pool.execute(
      "SELECT * FROM res_cart_guest WHERE cart_id = ?",
      [cartId]
    );
    
    // Recompute prices from source
    const recomputedCart = await recomputeGuestCartPrices(fresh);
    
    // Update cart with recomputed prices if changed
    if (recomputedCart.length > 0) {
      for (const item of recomputedCart) {
        const dbItem = fresh.find(db => db.item_id === item.item_id && db.item_type === item.item_type);
        if (dbItem && (Number(dbItem.sale_price) !== item.sale_price || Number(dbItem.original_price) !== item.original_price)) {
          await pool.execute(
            `UPDATE res_cart_guest SET sale_price = ?, original_price = ? WHERE cart_id = ? AND item_id = ? AND item_type = ?`,
            [item.sale_price, item.original_price, cartId, item.item_id, item.item_type]
          );
        }
      }
    }
    
    // Calculate totals
    const currency = req.body.currency || req.query.currency || 'USD';
    const totals = await calculateGuestCartTotals(recomputedCart, currency);
    
    return res.status(200).json({
      message: "Guest cart synchronized",
      cart: recomputedCart,
      cartVersion: deriveVersion(recomputedCart),
      moduleType: getExclusiveTypesFromItems(recomputedCart)[0] || null,
      totals: totals,
    });
  } catch (e) {
    return res.status(500).json({ message: "Internal server error" });
  }
}

// Merge guest cart into authenticated user's cart
async function mergeGuestToUser(req, res) {
  try {
    const userId = req.user?.id;
    const cartId = req.cartId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const [guestRows] = await pool.execute("SELECT * FROM res_cart_guest WHERE cart_id = ?", [cartId]);
    if (!guestRows.length) {
      // nothing to merge; just return current user cart
      const [userCart] = await pool.execute("SELECT * FROM res_cart WHERE user_id = ?", [userId]);
      return res.status(200).json({
        message: "No guest cart to merge",
        cart: userCart,
      });
    }
    const [userRows] = await pool.execute("SELECT * FROM res_cart WHERE user_id = ?", [userId]);
    const guestTypes = getExclusiveTypesFromItems(guestRows);
    const userTypes = getExclusiveTypesFromItems(userRows);
    const conflict = guestTypes.length && userTypes.length && guestTypes[0] !== userTypes[0];

    // If conflict, replace user cart with guest cart; else merge by (item_id,item_type)
    if (conflict) {
      await pool.execute("DELETE FROM res_cart WHERE user_id = ?", [userId]);
      const values = guestRows.map((r) => [
        userId,
        r.item_id,
        r.item_type,
        r.item_name,
        r.sale_price,
        r.original_price ?? r.sale_price,
        r.quantity ?? 1,
        null,
        r.media || "",
        r.meta || null,
        r.min_cart_qty ?? 1,
        r.max_cart_qty ?? 1,
      ]);
      if (values.length) {
        await pool.query(
          `INSERT INTO res_cart 
           (user_id, item_id, item_type, item_name, sale_price, original_price, quantity, stock, media, meta, min_cart_qty, max_cart_qty)
           VALUES ?`,
          [values]
        );
      }
    } else {
      // Merge quantities for identical lines; append new ones
      const userKey = new Map();
      userRows.forEach((u) => userKey.set(`${u.item_id}-${u.item_type}`, u));
      for (const g of guestRows) {
        const key = `${g.item_id}-${g.item_type}`;
        const existing = userKey.get(key);
        if (existing) {
          const newQty = Number(existing.quantity || 1) + Number(g.quantity || 1);
          await pool.execute(
            `UPDATE res_cart SET quantity = ?, sale_price = ?, original_price = ?, item_name = ?, media = ?, meta = ? 
             WHERE user_id = ? AND item_id = ? AND item_type = ?`,
            [
              newQty,
              g.sale_price,
              g.original_price ?? g.sale_price,
              g.item_name,
              g.media || "",
              g.meta || null,
              userId,
              g.item_id,
              g.item_type,
            ]
          );
        } else {
          await pool.execute(
            `INSERT INTO res_cart (user_id, item_id, item_type, item_name, sale_price, original_price, quantity, stock, media, meta, min_cart_qty, max_cart_qty)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              g.item_id,
              g.item_type,
              g.item_name,
              g.sale_price,
              g.original_price ?? g.sale_price,
              g.quantity ?? 1,
              null,
              g.media || "",
              g.meta || null,
              g.min_cart_qty ?? 1,
              g.max_cart_qty ?? 1,
            ]
          );
        }
      }
    }
    // Clear guest cart after merge
    await pool.execute("DELETE FROM res_cart_guest WHERE cart_id = ?", [cartId]);
    const [finalCart] = await pool.execute("SELECT * FROM res_cart WHERE user_id = ?", [userId]);
    
    // Recompute prices from source (same as user cart)
    const recomputedCart = await recomputeGuestCartPrices(finalCart);
    
    // Update cart with recomputed prices if changed
    if (recomputedCart.length > 0) {
      for (const item of recomputedCart) {
        const dbItem = finalCart.find(db => db.item_id === item.item_id && db.item_type === item.item_type);
        if (dbItem && (Number(dbItem.sale_price) !== item.sale_price || Number(dbItem.original_price) !== item.original_price)) {
          await pool.execute(
            `UPDATE res_cart SET sale_price = ?, original_price = ? WHERE user_id = ? AND item_id = ? AND item_type = ?`,
            [item.sale_price, item.original_price, userId, item.item_id, item.item_type]
          );
        }
      }
    }
    
    // Get final cart with recomputed prices
    const [finalCartWithPrices] = await pool.execute("SELECT * FROM res_cart WHERE user_id = ?", [userId]);
    
    // Validate that all items have valid prices before calculating
    const hasInvalidPrices = finalCartWithPrices.some(item => {
      const salePrice = Number(item.sale_price || 0);
      const quantity = Number(item.quantity || 1);
      return salePrice <= 0 && quantity > 0;
    });
    
    // Calculate totals using OrderCalculationService
    const currency = 'USD'; // Default currency, can be extracted from request if needed
    let totals = { subtotal: 0, shipping: 0, discount: 0, tax: 0, total: 0 };
    
    // Only use OrderCalculationService if all items have valid prices
    if (!hasInvalidPrices && finalCartWithPrices.length > 0) {
    try {
      const calculationResult = await OrderCalculationService.calculateOrder({
        userId,
        currency,
        discountCode: null,
        recordDiscountUsage: false,
        paymentGatewayId: null,
      });
      const calc = calculationResult.calculationResult || calculationResult;
      totals = {
        subtotal: Number((calc.subtotal || 0).toFixed(2)),
        shipping: 0,
        discount: Number((calc.discount?.amount || 0).toFixed(2)),
        tax: Number((calc.tax?.total || 0).toFixed(2)),
        total: Number((calc.total || 0).toFixed(2)),
      };
    } catch (calcError) {
        // Fallback to simple calculation if OrderCalculationService fails
        const subtotal = finalCartWithPrices.reduce((sum, item) => {
          const salePrice = Number(item.sale_price || 0);
          const quantity = Number(item.quantity || 1);
          return sum + (salePrice * quantity);
        }, 0);
        totals = {
          subtotal: Number(subtotal.toFixed(2)),
          shipping: 0,
          discount: 0,
          tax: 0,
          total: Number(subtotal.toFixed(2)),
        };
      }
    } else {
      // Use simple calculation if there are items with invalid prices
      const subtotal = finalCartWithPrices.reduce((sum, item) => {
        const salePrice = Number(item.sale_price || 0);
        const quantity = Number(item.quantity || 1);
        return sum + (salePrice * quantity);
      }, 0);
      totals = {
        subtotal: Number(subtotal.toFixed(2)),
        shipping: 0,
        discount: 0,
        tax: 0,
        total: Number(subtotal.toFixed(2)),
      };
    }
    
    // Calculate version
    const finalVersion = finalCartWithPrices.length > 0 
      ? `${finalCartWithPrices.length}-${new Date(Math.max(...finalCartWithPrices.map(c => new Date(c.updated_at || c.created_at).getTime()))).getTime()}`
      : '0-0';
    
    return res.status(200).json({
      message: "Guest cart merged",
      cart: finalCartWithPrices,
      cartVersion: finalVersion,
      moduleType: getExclusiveTypesFromItems(finalCartWithPrices)[0] || null,
      totals: totals,
    });
  } catch (e) {
    return res.status(500).json({ message: "Internal server error" });
  }
}

module.exports = { getGuestCart, syncGuestCart, mergeGuestToUser };


