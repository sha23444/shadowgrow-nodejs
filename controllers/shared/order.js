const { pool, secretKey } = require("../../config/database");
const jwt = require("jsonwebtoken");

async function checkDiscount(req, res) {
  try {
    const { id } = req.user;
    const { currency } = req.body;

    // Fetch cart items for the logged-in user
    const [cartItems] = await pool.execute(
      `SELECT * FROM res_cart WHERE user_id = ?`,
      [id]
    );

    if (cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // check if currency code is valid

    const [currencyResult] = await pool.execute(
      `SELECT * FROM res_currencies WHERE currency_code = ?`,
      [currency]
    );

    if (currencyResult.length === 0) {
      return res.status(400).json({ message: "Invalid currency code" });
    }

    // Calculate the subtotal price of the cart

    let subTotal = cartItems.reduce((acc, item) => {
      const price = item.sale_price || 0;
      const quantity = item.quantity || 1;
      return acc + price * quantity;
    }, 0);

    // get the conversion rate for the currency

    const [conversionRate] = await pool.execute(
      `SELECT currency_code, rate FROM res_currencies WHERE currency_code = ? `,
      [currency]
    );

    if (conversionRate.length === 0) {
      return res.status(400).json({ message: "Invalid currency code" });
    }

    const exchangeRateResult = parseFloat(conversionRate[0].rate);

    const subTotalAmount = subTotal * exchangeRateResult;
    let total = subTotalAmount;

    // Fetch all applicable taxes
    const [taxes] = await pool.execute(`SELECT * FROM res_tax_classes`);

    // Calculate the total tax amount based on the subtotal
    let totalTax = taxes.reduce((acc, tax) => {
      let taxAmount = 0;
      if (tax.amount_type === "percentage") {
        taxAmount = (subTotalAmount * parseFloat(tax.amount)) / 100;
      } else if (tax.amount_type === "fixed") {
        taxAmount = parseFloat(tax.amount) * exchangeRateResult;
      }
      return acc + taxAmount;
    }, 0);

    // Calculate the total amount after applying tax
    const totalAmountAfterTax = total + totalTax;

    // Prepare the response
    let response = {
      currency,
      subTotal: subTotalAmount,
      taxes: taxes,
      total: totalAmountAfterTax,
    };

    return res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      error: "Internal Server Error",
      cart: [],
    });
  }
}

async function checkDiscountCoupon(req, res) {
  try {
    const { discount_code, currency, hashId, address_id } = req.body;

    if (!discount_code || !currency) {
      return res.status(400).json({ message: "Invalid request" });
    }

    // check if discount code exists

    const [couponResult] = await pool.execute(
      `SELECT * FROM discounts WHERE code = ?`,
      [discount_code]
    );

    if (couponResult.length === 0) {
      return res.status(400).json({ message: "Invalid discount code" });
    }

    // check if discount code is active

    const coupon = couponResult[0];

    if (coupon.is_active == 0) {
      return res.status(400).json({ message: "Discount code is not active." });
    }

    // Check if coupon is expired
    const currentDate = new Date();

    if (currentDate < new Date(coupon.start_date)) {
      return res
        .status(400)
        .json({ message: "Discount code is not active yet." });
    }

    if (currentDate > new Date(coupon.end_date)) {
      return res.status(400).json({ message: "Discount code has expired." });
    }

    const headers = req.headers.authorization;

    if (!headers && !hashId) {
      return res
        .status(400)
        .json({ message: "Please login to apply discount" });
    }

    // Fetch cart items

    let cartItems = [];

    if (hashId) {
      cartItems = await pool.execute(
        `SELECT * FROM res_cart WHERE cart_hash = ?`,
        [hashId]
      );
    }

    if (!hashId) {
      const headers = req.headers.authorization;
      const token = headers.split(" ")[1];
      const decoded = jwt.verify(token, secretKey);

      const userId = decoded.id;

      cartItems = await pool.execute(
        `SELECT * FROM res_cart WHERE user_id = ?`,
        [userId]
      );
    }

    if (cartItems.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const cart = cartItems[0];

    // Calculate subtotal for validation
    const subtotal = cart.reduce(
      (acc, item) => acc + (+item.sale_price || 0) * (item.quantity || 1),
      0
    );

    // Check minimum order value

    if (subtotal < +coupon.min_order_amount) {
      return res.status(400).json({
        message: `Minimum order value for this discount code is ${coupon.min_order_amount}`,
      });
    }

    // Check product type restrictions

    let cartTotalAmount = 0;
    let eligibleProducts = [];

    if (coupon.discount_type == "product") {
      const [discountProducts] = await pool.execute(
        `SELECT * FROM discount_products WHERE discount_id = ?`,
        [coupon.id]
      );

      if (discountProducts.length === 0) {
        return res.status(400).json({
          message: "Discount code is not applicable to any products",
        });
      }

      const validItemsTypes = discountProducts.map((dp) => dp.item_type);
      const cartItemsTypes = cart.map((item) => item.item_type);

      const isValidItems = validItemsTypes.some((type) =>
        cartItemsTypes.includes(type)
      );

      if (!isValidItems) {
        return res.status(400).json({
          message: "Discount code is not applicable to any items in the cart",
        });
      }

      // now check for specific items

      const discountItemsTypes = discountProducts
        .filter((dp) => dp.item_id === null)
        .map((dp) => dp.item_type);

      const discountItems = discountProducts.filter(
        (dp) => dp.item_id !== null
      );

      const items1 = cart.filter((item) =>
        discountItemsTypes.includes(item.item_type)
      );

      const items2 = cart.filter((cartItem) =>
        discountItems.some(
          (discountItem) =>
            cartItem.item_id === discountItem.item_id &&
            cartItem.item_type === discountItem.item_type
        )
      );

      // Merge and de-duplicate items using a Set based on a unique key (item_id|item_type)
      const mergedItems = [...items1, ...items2];

      const seen = new Set();
      const validItems = mergedItems.filter((item) => {
        const key = `${item.item_id}|${item.item_type}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

      eligibleProducts = validItems;

      cartTotalAmount = validItems.reduce(
        (acc, item) => acc + (+item.sale_price || 0) * (item.quantity || 1),
        0
      );
    }

    if (coupon.discount_type == "order") {
      cartTotalAmount = subtotal;
    }

    if (coupon.discount_type == "shipping") {
      if (!address_id) {
        return res.status(400).json({
          message: "Please provide an address for shipping discount",
        });
      }

      // check if cart have dont have item_type 6

      const hasShipping = cart.some((item) => item.item_type === 6);

      if (!hasShipping) {
        return res.status(400).json({
          message: "Discount code is not applicable to shipping",
        });
      }

      const [address] = await pool.execute(
        `SELECT * FROM res_user_addresses WHERE address_id = ?`,
        [address_id]
      );

      if (address.length === 0) {
        return res.status(400).json({
          message: "Invalid address",
        });
      }

      const [discountShipping] = await pool.execute(
        `SELECT * FROM discount_shipping WHERE discount_id = ? AND country_code = ?`,
        [coupon.id, address[0].country_code]
      );

      if (discountShipping.length === 0) {
        return res.status(400).json({
          message:
            "Discount code is not applicable to shipping in this country",
        });
      }

      cartTotalAmount = subtotal;
    }

    let amount = 0;

    if (coupon.value_type == "fixed") {
      amount = parseFloat(coupon.value);
    } else if (coupon.value_type == "percentage") {
      amount = parseFloat(cartTotalAmount * (coupon.value / 100));
    }

    // Check if discount amount is greater than the total amount

    if (amount > cartTotalAmount) {
      return res.status(400).json({
        message: "Discount amount is greater than the total amount",
      });
    }

    return res.status(200).json({
      message: "Discount code is valid",
      discount: {
        coupon_id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount_value: coupon.value,
        discount_type: coupon.discount_type,
        value_type: coupon.value_type,
        total_discount: parseFloat(amount).toFixed(2),
        eligibleProducts: eligibleProducts.map((item) => ({
          item_id: item.item_id,
          item_type: item.item_type,
          item_name: item.item_name,
          sale_price: item.sale_price,
          quantity: item.quantity,
          total_discount: parseFloat(
            (item.sale_price * item.quantity * +coupon.value) / 100
          ).toFixed(2),
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
}

module.exports = { checkDiscount, checkDiscountCoupon };
