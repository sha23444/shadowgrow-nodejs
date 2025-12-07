var express = require("express");
var router = express.Router();

const CurrencyController = require("../../controllers/admin/currencies");
const exchangeRateController = require("../../controllers/admin/exchangeRates");
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.get("/", authenticateUser, CurrencyController.getCurrency);
router.get("/all", authenticateUser, exchangeRateController.getAllCurrencies);
router.get("/exchange-rates/latest", authenticateUser, exchangeRateController.getLatestExchangeRates);
router.get("/exchange-rates/last-updated", authenticateUser, exchangeRateController.getLastUpdatedTimestamp);
router.get("/exchange-rates/stats", authenticateUser, exchangeRateController.getCurrencyUpdateStats);
router.post("/add", authenticateUser, CurrencyController.addCurrency);
router.put("/update", authenticateUser, CurrencyController.updateCurrency);
router.delete("/delete", authenticateUser, CurrencyController.deleteCurrency);

module.exports = router;