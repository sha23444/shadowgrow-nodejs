var express = require("express");
var router = express.Router();

const OrdersController = require("../../controllers/admin/orders");
const authenticateAdmin = require("../../middlewars/authenticateAdmin");
const {
  authorizeAdmin,
  buildPermissionKey,
} = require("../../middlewars/authorizeAdmin");

const perms = {
  list: buildPermissionKey("orders", "list"),
  view: buildPermissionKey("orders", "view"),
  edit: buildPermissionKey("orders", "edit"),
  delete: buildPermissionKey("orders", "delete"),
};

router.use(authenticateAdmin);

router.get("/list", authorizeAdmin([perms.list]), OrdersController.getAllOrderList);
router.get(
  "/digital-files",
  authorizeAdmin([perms.list]),
  OrdersController.getDigitalFilesSales
);
router.get(
  "/download-packages",
  authorizeAdmin([perms.list]),
  OrdersController.getDownloadPackageOrders
);
router.get(
  "/download-packages/stats",
  authorizeAdmin([perms.view, perms.list]),
  OrdersController.getDownloadPackageOrdersStats
);
router.get(
  "/completed-paid",
  authorizeAdmin([perms.list]),
  OrdersController.getCompletedPaidOrders
);
router.get(
  "/completed-paid/stats",
  authorizeAdmin([perms.view, perms.list]),
  OrdersController.getCompletedPaidOrdersStats
);
router.get(
  "/digital-files/stats",
  authorizeAdmin([perms.view, perms.list]),
  OrdersController.getDigitalFilesSalesStats
);
router.get(
  "/:order_id",
  authorizeAdmin([perms.view, perms.list]),
  OrdersController.getOrderDetails
);
router.post(
  "/confirm-order",
  authorizeAdmin([perms.edit]),
  OrdersController.confirmOrder
);
router.post(
  "/cancel-order",
  authorizeAdmin([perms.edit]),
  OrdersController.cancelOrder
);

module.exports = router;