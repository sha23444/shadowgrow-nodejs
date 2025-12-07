var express = require("express");
var router = express.Router();

const APIManagerController  = require("../../controllers/admin/apiManager");
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.get("/permission/list", authenticateUser, APIManagerController.getApiPermissions);
router.post("/add", authenticateUser, APIManagerController.addApiKey);
router.get("/list", authenticateUser, APIManagerController.getApiKeys);
router.get("/api/:id", authenticateUser, APIManagerController.getApiKeyDetails);
router.put("/update", authenticateUser, APIManagerController.updateApiKey);
router.delete("/delete/:id", authenticateUser, APIManagerController.deleteApiKey);



module.exports = router;
