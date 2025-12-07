const express = require("express");
const router = express.Router();

const ServiceController = require("../../controllers/admin/services");

// Service Categories routes
router.post("/categories", ServiceController.createServiceCategory);
router.get("/categories", ServiceController.getServiceCategories);

// Service Bookings routes
router.post("/bookings", ServiceController.createServiceBooking);
router.get("/bookings", ServiceController.getServiceBookings);
router.put("/bookings/:id/status", ServiceController.updateServiceBookingStatus);

// Service CRUD routes
router.post("/", ServiceController.createService);
router.get("/", ServiceController.getServices);
router.get("/:id", ServiceController.getServiceById);
router.put("/:id", ServiceController.updateService);
router.delete("/:id", ServiceController.deleteService);

module.exports = router;
