const express = require("express");
const router = express.Router();

const CurrencyController = require("../../controllers/user/currencies");

router.get("/",  CurrencyController.getCurrency);

module.exports = router;
