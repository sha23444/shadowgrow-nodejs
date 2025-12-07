const express = require("express");
const { getMediaList } = require("../../controllers/admin/media");

const router = express.Router();

router.get("/", getMediaList);

module.exports = router;
