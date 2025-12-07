const { randomUUID } = require('crypto');

module.exports = function ensureCartIdCookie(req, res, next) {
  try {
    const existing = req.cookies?.cart_id;
    if (existing && typeof existing === 'string') {
      req.cartId = existing;
      return next();
    }
    // No existing cart_id cookie, create one
    const id = randomUUID();
    // 30 days
    res.cookie('cart_id', id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production', // Use secure in production
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    req.cartId = id;
    return next();
  } catch (e) {
    // Fallback: generate a simple id
    req.cartId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return next();
  }
}


