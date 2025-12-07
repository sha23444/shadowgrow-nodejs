const express = require('express');
const router = express.Router();

const authenticateToken = require('../../middlewars/authenticateToken');

const {
  getServices,
  getServiceCategories,
  getServiceBySlug,
  createServiceBooking,
  getServiceBookingById,
  listMyServiceBookings,
  updateServiceBookingPayment,
  updateServiceBookingStatus,
  prepareServiceCheckout,
  markBookingPaymentByOrder,
} = require('../../controllers/user/services');

router.get('/', getServices);
router.get('/categories', getServiceCategories);
router.get('/bookings', authenticateToken, listMyServiceBookings);
router.get('/bookings/:bookingId', authenticateToken, getServiceBookingById);
router.put('/bookings/:bookingId/payment', authenticateToken, updateServiceBookingPayment);
router.put('/bookings/:bookingId/status', authenticateToken, updateServiceBookingStatus);
router.post('/bookings/:bookingId/checkout', authenticateToken, prepareServiceCheckout);
router.put('/bookings/order/:orderId/payment', authenticateToken, markBookingPaymentByOrder);
router.post('/:serviceId/bookings', authenticateToken, createServiceBooking);
router.get('/:slug', getServiceBySlug);

module.exports = router;

