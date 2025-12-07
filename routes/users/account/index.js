const express = require("express");
const router = express.Router();

const courseRouter = require("./courses");
const overviewRouter = require("./overview");
const orderRouter = require("./orders");
const downloadsRouters = require("./downloads");
const downloadPackagesRouter = require("./downloadPackages");
const addressRouter = require("./address");
const profileRouter = require("./profile");
const transactionsRouter = require("./transactions");

router.use("/courses", courseRouter);
router.use("/overview", overviewRouter);
router.use("/orders", orderRouter);
router.use("/downloads", downloadsRouters);
router.use("/packages", downloadPackagesRouter);
router.use("/address", addressRouter);
router.use("/profile", profileRouter);
router.use("/transactions", transactionsRouter);


module.exports = router;
