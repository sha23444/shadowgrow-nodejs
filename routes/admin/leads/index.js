const express = require("express");
const router = express.Router();
const authenticateUser = require('../../../middlewars/authenticateAdmin');

const statusRouter = require("./status");
const sourceRouter = require("./source");
const labelRouter = require("./label");
const taskStatusRouter = require("./taskStatus");
const taskLabelRouter = require("./taskLabel");
const leadRouter = require("./lead");

router.use("/status", authenticateUser, statusRouter);
router.use("/source", authenticateUser, sourceRouter);
router.use("/label", authenticateUser, labelRouter);
router.use("/task-status", authenticateUser, taskStatusRouter);
router.use("/task-label", authenticateUser, taskLabelRouter);
router.use("/lead", authenticateUser, leadRouter);


module.exports = router;
