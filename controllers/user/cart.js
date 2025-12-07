const { pool } = require("../../config/database");
const { ITEM_TYPE } = require("../utils/constants");

const EXCLUSIVE_ITEM_TYPES = new Set([1, 2, 3, 4, 6, 7]);
const MODULE_CONFLICT_CODE = 'CART_MODULE_CONFLICT';

const getModuleTypeName = (type) => ITEM_TYPE[type] || 'this module';

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizePrice = (value) => {
  const num = toNumber(value);
  return num !== null ? Number(num.toFixed(2)) : null;
};

const getExclusiveTypesFromItems = (items = []) => {
  const types = [];
  for (const item of items || []) {
    const type = Number(item?.item_type);
    if (EXCLUSIVE_ITEM_TYPES.has(type) && !types.includes(type)) {
      types.push(type);
    }
  }
  return types;
};

const buildModuleConflictResponse = (existingTypes, incomingTypes) => {
  const combinedTypes = Array.from(new Set([...existingTypes, ...incomingTypes]));

  if (combinedTypes.length <= 1) {
    return null;
  }

  const currentType = existingTypes[0] ?? combinedTypes[0];
  const attemptedType = combinedTypes.find((type) => type !== currentType) ?? combinedTypes[0];

  return {
    message: `You already have ${getModuleTypeName(currentType)} items in your cart. Please checkout or clear the cart before adding ${getModuleTypeName(attemptedType)} items.`,
    code: MODULE_CONFLICT_CODE,
    currentType,
    attemptedType,
  };
};

const deriveCartModuleType = (items = []) => {
  const [firstType] = getExclusiveTypesFromItems(items);
  return typeof firstType === 'number' ? firstType : null;
};

/**
 * Recompute prices for cart items from source (products table)
 * This ensures prices are always current and accurate
 */
async function recomputeCartPrices(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return cartItems;
  }

  // Group items by item_type for efficient querying
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

  // Fetch current prices from products table
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

  // Update cart items with current prices
  const updatedItems = cartItems.map((item) => {
    const itemType = Number(item.item_type);
    let currentPrice = priceMap.get(item.item_id);
    
    // For products (physical or digital), use current price from database
    if ((itemType === 6 || itemType === 3) && currentPrice) {
      return {
        ...item,
        sale_price: currentPrice.sale_price,
        original_price: currentPrice.original_price,
      };
    }
    
    // For other item types (files, packages, courses, services), keep existing price
    // These prices might come from different sources, so we don't recompute them here
    return item;
  });

  return updatedItems;
}

/**
 * Calculate cart totals using the existing OrderCalculationService
 * This uses the same logic as checkout for consistency
 */
async function calculateCartTotals(cartItems, userId, currency = 'USD') {
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
    // Use the existing OrderCalculationService for consistent calculations
    const OrderCalculationService = require('../../services/OrderCalculationService');
    const calculationResult = await OrderCalculationService.calculateOrder({
      userId,
      currency,
      discountCode: null, // No discount for basic cart total
      recordDiscountUsage: false,
      paymentGatewayId: null,
    });

    const calc = calculationResult.calculationResult || calculationResult;
    return {
      subtotal: Number((calc.subtotal || 0).toFixed(2)),
      shipping: 0, // Shipping calculated separately if needed
      discount: Number((calc.discount?.amount || 0).toFixed(2)),
      tax: Number((calc.tax?.total || 0).toFixed(2)),
      total: Number((calc.total || calc.subtotal || 0).toFixed(2)),
    };
  } catch (error) {
    // Fallback to simple calculation if service fails (e.g., 0 prices for free items)
    // This is valid for free products, so we don't log it as an error
    const subtotal = cartItems.reduce((sum, item) => {
      // Use sale_price if available and > 0, otherwise use original_price, otherwise 0
      const salePrice = Number(item.sale_price || 0);
      const originalPrice = Number(item.original_price || 0);
      const price = salePrice > 0 ? salePrice : (originalPrice > 0 ? originalPrice : 0);
      const quantity = Number(item.quantity || 1);
      return sum + (price * quantity);
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


async function syncCart(req, res) {
  const { id } = req.user;

  try {
    const { cartItems = [], isUpdate = false, cartVersion: clientVersion } = req.body; // Extract cartItems and cartVersion from request body

    if (!Array.isArray(cartItems)) {
      return res.status(400).json({ message: "Invalid cartItems format." });
    }

    if (cartItems.length === 0) {
      // Delete all cart items when empty array is provided
      await pool.execute("DELETE FROM res_cart WHERE user_id = ?", [id]);
      
      return res.status(200).json({
        message: "Cart cleared successfully.",
        cart: [],
      });
    }

    // Fetch user's existing cart items before any mutations
    let [existingCartItems] = await pool.execute(
      "SELECT * FROM res_cart WHERE user_id = ?",
      [id]
    );
    // Compute server cart version before write
    const [[metaBefore]] = await pool.execute(
      "SELECT COUNT(*) AS cnt, COALESCE(MAX(updated_at), NOW()) AS mx FROM res_cart WHERE user_id = ?",
      [id]
    );
    const serverVersionBefore = `${metaBefore.cnt}-${new Date(metaBefore.mx).getTime()}`;
    if (clientVersion && clientVersion !== serverVersionBefore) {
      // If server cart is empty, allow sync to proceed (no real conflict)
      // Empty carts can always be replaced
      if (existingCartItems.length === 0) {
        // Server cart is empty, proceed with sync - no conflict
        // This allows user to add items even if version mismatch on empty cart
      } else {
        // Server cart has items and version mismatch - return conflict
        const recomputedExistingCart = await recomputeCartPrices(existingCartItems);
        let existingTotals;
        try {
          existingTotals = await calculateCartTotals(recomputedExistingCart, id, 'USD');
        } catch {
          // Fallback if calculation fails (e.g., free items with 0 prices)
          existingTotals = {
            subtotal: recomputedExistingCart.reduce((sum, item) => {
              const salePrice = Number(item.sale_price || 0);
              const originalPrice = Number(item.original_price || 0);
              const price = salePrice > 0 ? salePrice : (originalPrice > 0 ? originalPrice : 0);
              return sum + (price * Number(item.quantity || 1));
            }, 0),
            shipping: 0,
            discount: 0,
            tax: 0,
            total: 0,
          };
          existingTotals.total = existingTotals.subtotal;
        }
        
        return res.status(409).json({
          message: "Cart version conflict. Refetch required.",
          code: "CART_VERSION_CONFLICT",
          cart: recomputedExistingCart,
          cartVersion: serverVersionBefore,
          moduleType: deriveCartModuleType(recomputedExistingCart),
          totals: existingTotals,
        });
      }
    }

    // Validate module exclusivity before making changes
    const existingExclusiveTypes = getExclusiveTypesFromItems(existingCartItems);
    const incomingExclusiveTypes = getExclusiveTypesFromItems(cartItems);
    const conflictDetails = buildModuleConflictResponse(existingExclusiveTypes, incomingExclusiveTypes);
    let replacementDetails = null;

    if (conflictDetails) {
      // Recompute prices for existing cart before returning conflict
      const recomputedExistingCart = await recomputeCartPrices(existingCartItems);
      let existingTotals;
      try {
        existingTotals = await calculateCartTotals(recomputedExistingCart, id, 'USD');
      } catch {
        // Fallback if calculation fails
        existingTotals = {
          subtotal: recomputedExistingCart.reduce((sum, item) => {
            const salePrice = Number(item.sale_price || 0);
            const originalPrice = Number(item.original_price || 0);
            const price = salePrice > 0 ? salePrice : (originalPrice > 0 ? originalPrice : 0);
            return sum + (price * Number(item.quantity || 1));
          }, 0),
          shipping: 0,
          discount: 0,
          tax: 0,
          total: 0,
        };
        existingTotals.total = existingTotals.subtotal;
      }
      
      // Return conflict; let client decide to replace
      return res.status(409).json({
        message: conflictDetails.message,
        code: MODULE_CONFLICT_CODE,
        details: {
          currentType: conflictDetails.currentType,
          attemptedType: conflictDetails.attemptedType,
        },
        cart: recomputedExistingCart,
        cartVersion: serverVersionBefore,
        moduleType: deriveCartModuleType(recomputedExistingCart),
        totals: existingTotals,
      });
    }

    // if isUpdate is true, remove items from the cart
    if (!isUpdate) {
      await pool.execute("DELETE FROM res_cart WHERE user_id = ?", [id]);
    }

    const userCartItems = isUpdate ? existingCartItems : [];

    // Prepare update and insert lists
    const itemsToUpdate = [];
    const itemsToInsert = [];
    const existingItemIds = new Set(userCartItems.map((item) => item.item_id));

    for (const item of cartItems) {
      if (!item.item_id || !item.item_name || item.sale_price === undefined) {
        return res.status(400).json({ message: 'Invalid cart item payload.' });
      }

      const salePrice = normalizePrice(item.sale_price);
      // Allow 0 price for free items, but reject null/invalid prices
      if (salePrice === null || salePrice < 0) {
        return res.status(400).json({
          message: `Invalid price for ${item.item_name}. Please refresh the page and try again.`,
          code: 'CART_INVALID_PRICE',
        });
      }
      const originalPriceFromPayload = item.original_price !== undefined ? normalizePrice(item.original_price) : null;
      const normalizedItem = {
        ...item,
        user_id: id,
        sale_price: salePrice,
        original_price: originalPriceFromPayload && originalPriceFromPayload > 0 ? originalPriceFromPayload : salePrice,
        quantity: item.quantity ?? 1,
        stock: item.stock !== undefined ? toNumber(item.stock) : null,
        min_cart_qty: item.min_cart_qty ?? 1,
        max_cart_qty: item.max_cart_qty ?? 1,
      };

      // Recompute price from source (products table) for products
      const itemType = Number(item.item_type);
      const quantity = normalizedItem.quantity;
      
      // Fetch current price from products table for physical/digital products
      if (itemType === 6 || itemType === 3) {
        try {
          const [products] = await pool.execute(
            "SELECT sale_price, original_price, stock_quantity, track_inventory FROM res_products WHERE product_id = ?",
            [item.item_id]
          );
          
          if (products.length > 0) {
            const product = products[0];
            // Update prices from source
            normalizedItem.sale_price = Number(product.sale_price || 0);
            normalizedItem.original_price = Number(product.original_price || product.sale_price || 0);
            
            // Validate inventory for items that need stock tracking
            if (shouldReserveStock(itemType)) {
              const stockQuantity = product.stock_quantity !== null ? Number(product.stock_quantity) : null;
              const trackInventory = product.track_inventory === 1 || product.track_inventory === true;

              // Validate stock only if:
              // 1. Physical products (always)
              // 2. Digital products with inventory tracking enabled
              if (itemType === 6 || (itemType === 3 && trackInventory && stockQuantity !== null)) {
                if (stockQuantity === null || stockQuantity < quantity) {
                  return res.status(400).json({
                    message: `Insufficient stock for ${item.item_name}. Available: ${stockQuantity || 0}, Requested: ${quantity}`,
                    code: 'INSUFFICIENT_STOCK',
                    item_id: item.item_id,
                    item_name: item.item_name,
                    available_stock: stockQuantity,
                    requested_quantity: quantity,
                  });
                }

                // Update the stock field in normalizedItem for consistency
                normalizedItem.stock = stockQuantity;
              }
            }
          }
        } catch (productError) {
          // If product lookup fails, log but continue (don't block cart operation)
          console.error(`Error fetching product ${item.item_id}:`, productError);
        }
      }

      if (existingItemIds.has(item.item_id)) {
        itemsToUpdate.push(normalizedItem);
      } else {
        itemsToInsert.push(normalizedItem);
      }
    }

    // Update existing cart items
    if (itemsToUpdate.length > 0) {
      for (const item of itemsToUpdate) {
        await pool.execute(
          `UPDATE res_cart 
          SET quantity = ?, 
              sale_price = ?, 
              original_price = ?, 
              item_name = ?, 
              stock = ?, 
              meta = ? 
          WHERE user_id = ? 
          AND item_id = ?`,
          [
            item.quantity ?? 1,
            item.sale_price,
            item.original_price,
            item.item_name,
            item.stock !== undefined ? item.stock : null,
            item.meta || null,
            item.user_id,
            item.item_id,
          ]
        );
      }
    }

    // Insert new cart items
    if (itemsToInsert.length > 0) {
      const insertCartQuery = `
        INSERT INTO res_cart 
        (user_id, item_id, item_type, item_name, sale_price, original_price, quantity, stock, media, meta, min_cart_qty, max_cart_qty) 
        VALUES ?
      `;

      const cartValues = itemsToInsert.map((item) => [
        item.user_id,
        item.item_id,
        item.item_type,
        item.item_name,
        item.sale_price,
        item.original_price,
        item.quantity ?? 1,
        item.stock !== null ? item.stock : null,
        item.media || "",
        item.meta || null,
        item.min_cart_qty ?? 1,
        item.max_cart_qty ?? 1,
      ]);

      await pool.query(insertCartQuery, [cartValues]);
    }

    const [freshCartItems] = await pool.execute(
      "SELECT * FROM res_cart WHERE user_id = ?",
      [id]
    );
    
    // Recompute prices from source to ensure accuracy
    const recomputedCartItems = await recomputeCartPrices(freshCartItems);
    
    // Update cart in database with recomputed prices
    if (recomputedCartItems.length > 0) {
      for (const item of recomputedCartItems) {
        const dbItem = freshCartItems.find(db => db.item_id === item.item_id && db.item_type === item.item_type);
        // Only update if price changed
        if (dbItem && (Number(dbItem.sale_price) !== item.sale_price || Number(dbItem.original_price) !== item.original_price)) {
          await pool.execute(
            `UPDATE res_cart SET sale_price = ?, original_price = ? WHERE user_id = ? AND item_id = ? AND item_type = ?`,
            [item.sale_price, item.original_price, id, item.item_id, item.item_type]
          );
        }
      }
    }
    
    // Calculate totals using the existing calculation service
    // Note: For basic sync, we use USD as default currency
    // Frontend can call /calculate endpoint with specific currency if needed
    let totals;
    try {
      totals = await calculateCartTotals(recomputedCartItems, id, 'USD');
    } catch (calcError) {
      // If calculation fails (e.g., 0 prices for free items), use fallback
      // This prevents cart from being cleared due to calculation errors
      totals = {
        subtotal: recomputedCartItems.reduce((sum, item) => {
          const salePrice = Number(item.sale_price || 0);
          const originalPrice = Number(item.original_price || 0);
          const price = salePrice > 0 ? salePrice : (originalPrice > 0 ? originalPrice : 0);
          return sum + (price * Number(item.quantity || 1));
        }, 0),
        shipping: 0,
        discount: 0,
        tax: 0,
        total: 0,
      };
      totals.total = totals.subtotal;
    }
    
    const [[metaSync]] = await pool.execute(
      "SELECT COUNT(*) AS cnt, COALESCE(MAX(updated_at), NOW()) AS mx FROM res_cart WHERE user_id = ?",
      [id]
    );
    const serverVersionSync = `${metaSync.cnt}-${new Date(metaSync.mx).getTime()}`;

    return res.status(200).json({
      message: replacementDetails
        ? "Cart replaced with your latest selection."
        : "Cart synchronized successfully.",
      cart: recomputedCartItems,
      moduleType: deriveCartModuleType(recomputedCartItems),
      cartVersion: serverVersionSync,
      totals: totals, // Include computed totals using existing service
      ...(replacementDetails ? { details: replacementDetails, code: MODULE_CONFLICT_CODE } : {}),
    });
  } catch (error) {
    // Don't clear cart on error - return existing cart if available
    try {
      const [existingCart] = await pool.execute(
        "SELECT * FROM res_cart WHERE user_id = ?",
        [id]
      );
      
      if (existingCart && existingCart.length > 0) {
        const recomputedExisting = await recomputeCartPrices(existingCart);
        const [[meta]] = await pool.execute(
          "SELECT COUNT(*) AS cnt, COALESCE(MAX(updated_at), NOW()) AS mx FROM res_cart WHERE user_id = ?",
          [id]
        );
        const version = `${meta.cnt}-${new Date(meta.mx).getTime()}`;
        
        // Try to calculate totals, but use fallback if it fails
        let totals;
        try {
          totals = await calculateCartTotals(recomputedExisting, id, 'USD');
        } catch {
          totals = {
            subtotal: recomputedExisting.reduce((sum, item) => {
              const salePrice = Number(item.sale_price || 0);
              const originalPrice = Number(item.original_price || 0);
              const price = salePrice > 0 ? salePrice : (originalPrice > 0 ? originalPrice : 0);
              return sum + (price * Number(item.quantity || 1));
            }, 0),
            shipping: 0,
            discount: 0,
            tax: 0,
            total: 0,
          };
          totals.total = totals.subtotal;
        }
        
        return res.status(200).json({
          message: "Cart retrieved successfully.",
          cart: recomputedExisting,
          moduleType: deriveCartModuleType(recomputedExisting),
          cartVersion: version,
          totals: totals,
        });
      }
    } catch (fallbackError) {
      // If even fallback fails, return empty cart instead of error
    }
    
    res.status(500).json({
      message: "An error occurred while syncing the cart.",
      error: error.message,
      cart: [],
      totals: { subtotal: 0, shipping: 0, discount: 0, tax: 0, total: 0 },
    });
  }
}

async function getCart(req, res) {
  try {
    const { id } = req.user; // Extract user ID from the token

    // Fetch the user's cart from the database
    const [cart] = await pool.execute(
      "SELECT * FROM res_cart WHERE user_id = ? AND is_active = 1",
      [id]
    );

    // Recompute prices from source to ensure accuracy
    const recomputedCart = await recomputeCartPrices(cart);
    
    // Update cart in database with recomputed prices (async, don't wait)
    if (recomputedCart.length > 0) {
      Promise.all(recomputedCart.map(async (item) => {
        const dbItem = cart.find(db => db.item_id === item.item_id && db.item_type === item.item_type);
        if (dbItem && (Number(dbItem.sale_price) !== item.sale_price || Number(dbItem.original_price) !== item.original_price)) {
          await pool.execute(
            `UPDATE res_cart SET sale_price = ?, original_price = ? WHERE user_id = ? AND item_id = ? AND item_type = ?`,
            [item.sale_price, item.original_price, id, item.item_id, item.item_type]
          );
        }
      })).catch(err => console.error('Error updating cart prices:', err));
    }
    
    // Calculate totals using the existing calculation service
    // Note: For basic get cart, we use USD as default currency
    // Frontend can call /calculate endpoint with specific currency if needed
    let totals;
    try {
      totals = await calculateCartTotals(recomputedCart, id, 'USD');
    } catch {
      // Fallback if calculation fails (e.g., free items with 0 prices)
      totals = {
        subtotal: recomputedCart.reduce((sum, item) => {
          const salePrice = Number(item.sale_price || 0);
          const originalPrice = Number(item.original_price || 0);
          const price = salePrice > 0 ? salePrice : (originalPrice > 0 ? originalPrice : 0);
          return sum + (price * Number(item.quantity || 1));
        }, 0),
        shipping: 0,
        discount: 0,
        tax: 0,
        total: 0,
      };
      totals.total = totals.subtotal;
    }

    // Return the cart with recomputed prices
    const [[metaGet]] = await pool.execute(
      "SELECT COUNT(*) AS cnt, COALESCE(MAX(updated_at), NOW()) AS mx FROM res_cart WHERE user_id = ?",
      [id]
    );
    const serverVersionGet = `${metaGet.cnt}-${new Date(metaGet.mx).getTime()}`;
    res.status(200).json({
      message: "Cart retrieved successfully.",
      cart: recomputedCart,
      cartVersion: serverVersionGet,
      moduleType: deriveCartModuleType(recomputedCart),
      totals: totals, // Include computed totals using existing service
    });
  } catch (error) {
    console.error("Error getting cart:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
}

/**
 * Check if an item type requires stock reservation
 * Physical products (6) always need stock reservation
 * Digital products (3) only if they have stock_quantity and track_inventory is true
 * Courses (4), digital files (1), subscription packages (2), service bookings (7) don't need stock reservation
 */
function shouldReserveStock(itemType) {
  // Physical products always need stock reservation
  if (itemType === 6) return true;
  // Digital products may have stock tracking
  if (itemType === 3) return true;
  // Courses (4), digital files (1), subscription packages (2), service bookings (7) don't need stock reservation
  return false;
}

/**
 * Release stock reservations for a quote
 */
async function releaseQuoteReservations(quoteId) {
  try {
    // Get quote with reservations
    const [quotes] = await pool.execute(
      "SELECT reservations FROM res_checkout_quotes WHERE quote_id = ? AND is_used = 0",
      [quoteId]
    );

    if (quotes.length === 0 || !quotes[0].reservations) {
      return;
    }

    const reservations = JSON.parse(quotes[0].reservations || '[]');
    
    // Release each reservation by updating product stock
    for (const reservation of reservations) {
      if (reservation.product_id && reservation.quantity_reserved) {
        // For now, we just mark the quote as used/expired
        // In a production system, you might want to track reserved_stock in products table
        // or use a separate reservations table
      }
    }

    // Mark quote as used/expired
    await pool.execute(
      "UPDATE res_checkout_quotes SET is_used = 1 WHERE quote_id = ?",
      [quoteId]
    );
  } catch (error) {
    console.error('Error releasing quote reservations:', error);
    // Don't throw - this is cleanup, shouldn't break the flow
  }
}

async function getCheckoutQuote(req, res) {
  try {
    const { id } = req.user;
    
    // Get all cart items with item_type
    const [cartItems] = await pool.execute(
      "SELECT * FROM res_cart WHERE user_id = ? AND is_active = 1",
      [id]
    );

    if (cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Recompute prices from source to ensure accuracy
    const recomputedCartItems = await recomputeCartPrices(cartItems);
    
    // Calculate totals using the existing calculation service
    // For checkout quotes, we can use default USD or extract from request
    const currency = req.body.currency || req.query.currency || 'USD';
    let totals;
    try {
      totals = await calculateCartTotals(recomputedCartItems, id, currency);
    } catch {
      // Fallback if calculation fails (e.g., free items with 0 prices)
      totals = {
        subtotal: recomputedCartItems.reduce((sum, item) => {
          const salePrice = Number(item.sale_price || 0);
          const originalPrice = Number(item.original_price || 0);
          const price = salePrice > 0 ? salePrice : (originalPrice > 0 ? originalPrice : 0);
          return sum + (price * Number(item.quantity || 1));
        }, 0),
        shipping: 0,
        discount: 0,
        tax: 0,
        total: 0,
      };
      totals.total = totals.subtotal;
    }
    const subtotal = totals.subtotal;
    const shipping = totals.shipping || 0;
    const total = totals.total;

    // Generate quote ID
    const quoteId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes TTL
    const reservations = [];

    // Check and reserve stock for items that need it (using recomputed prices)
    for (const cartItem of recomputedCartItems) {
      const itemType = Number(cartItem.item_type);
      const quantity = Number(cartItem.quantity || 1);
      
      if (!shouldReserveStock(itemType)) {
        // Skip reservation for items that don't need stock tracking
        continue;
      }

      // Query product to check stock_quantity and track_inventory
      let productQuery;
      if (itemType === 6) {
        // Physical products - query res_products
        productQuery = "SELECT product_id, stock_quantity, track_inventory FROM res_products WHERE product_id = ?";
      } else if (itemType === 3) {
        // Digital products - check if they track inventory
        productQuery = "SELECT product_id, stock_quantity, track_inventory FROM res_products WHERE product_id = ?";
      } else {
        continue; // Skip items that don't need reservation (courses, digital files, subscription packages, service bookings)
      }

      try {
        const [products] = await pool.execute(productQuery, [cartItem.item_id]);
        
        if (products.length === 0) {
          // Product not found - skip reservation but allow checkout
          continue;
        }

        const product = products[0];
        const stockQuantity = product.stock_quantity !== null ? Number(product.stock_quantity) : null;
        const trackInventory = product.track_inventory === 1 || product.track_inventory === true;

        // Only reserve if:
        // 1. Physical products (always if stock exists)
        // 2. Digital products (only if track_inventory is true and stock exists)
        if (itemType === 6 || (itemType === 3 && trackInventory && stockQuantity !== null)) {
          // Check available stock (for now, we'll just validate current stock)
          // In production, you'd need to sum up all active reservations
          if (stockQuantity === null || stockQuantity < quantity) {
            return res.status(400).json({
              message: `Insufficient stock for ${cartItem.item_name || 'item'}. Available: ${stockQuantity || 0}, Requested: ${quantity}`,
              code: 'INSUFFICIENT_STOCK',
              item_id: cartItem.item_id,
              available_stock: stockQuantity,
              requested_quantity: quantity,
            });
          }

          // Record reservation (for now, we just track it in the quote)
          // In production, you might want to update products table with reserved_stock
          reservations.push({
            item_id: cartItem.item_id,
            item_type: itemType,
            product_id: product.product_id,
            quantity_reserved: quantity,
            stock_before: stockQuantity,
          });
        }
      } catch (productError) {
        // If product lookup fails, skip reservation but allow quote generation
        console.error(`Error checking product ${cartItem.item_id}:`, productError);
        continue;
      }
    }

    // Store quote in database
    await pool.execute(
      `INSERT INTO res_checkout_quotes 
       (quote_id, user_id, subtotal, shipping, total, reservations, expires_at, is_used) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        quoteId,
        id,
        subtotal,
        shipping,
        total,
        reservations.length > 0 ? JSON.stringify(reservations) : null,
        expiresAt,
      ]
    );

    // Schedule cleanup job to release reservations after expiry (if not already used)
    // In production, use a cron job or job queue
    setTimeout(() => {
      releaseQuoteReservations(quoteId).catch(console.error);
    }, 10 * 60 * 1000); // 10 minutes

    res.status(200).json({
      message: "Checkout quote generated",
      quote_id: quoteId,
      expires_at: expiresAt.toISOString(),
      subtotal,
      shipping,
      total,
      reservations_count: reservations.length,
      has_reservations: reservations.length > 0,
    });
  } catch (error) {
    console.error('Error generating checkout quote:', error);
    res.status(500).json({ 
      message: "Internal Server Error",
      error: error.message,
    });
  }
}

/**
 * Mark a quote as used (called when order is created)
 */
async function markQuoteAsUsed(quoteId) {
  try {
    await pool.execute(
      "UPDATE res_checkout_quotes SET is_used = 1 WHERE quote_id = ?",
      [quoteId]
    );
  } catch (error) {
    console.error('Error marking quote as used:', error);
    // Don't throw - marking as used is best-effort
  }
}

module.exports = { syncCart, getCart, getCheckoutQuote, releaseQuoteReservations, markQuoteAsUsed };

module.exports.__test__ = {
  getExclusiveTypesFromItems,
  buildModuleConflictResponse,
  deriveCartModuleType,
  shouldReserveStock,
};

