const express = require("express");
const router = express.Router();

const courseRouter = require("./courses");
const profileRouter = require("./profile");
const orderRouter = require("./orders");
const downloadsRouters = require("./downloads");
const downloadPackagesRouter = require("./downloadPackages");
const walletRouter = require("./wallet");
const transactionRouter = require("./transactions");

const authenticateUser = require('../../../middlewars/authenticateAdmin');

router.use("/courses", authenticateUser, courseRouter);
router.use("/profile", authenticateUser, profileRouter);
router.use("/orders", authenticateUser, orderRouter);
router.use("/downloads", authenticateUser, downloadsRouters);
router.use("/packages", authenticateUser, downloadPackagesRouter);
router.use("/wallet", authenticateUser, walletRouter);
router.use("/transactions", authenticateUser, transactionRouter);


module.exports = router;
