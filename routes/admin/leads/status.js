var express = require("express");
var router = express.Router();

const StatusController = require("../../../controllers/admin/leads/status");

router.get("/", StatusController.getLeadStatuses);
router.post("/add", StatusController.addStatus);
router.put("/update", StatusController.updateStatus);
router.delete("/delete/:id", StatusController.deleteStatus);


module.exports = router;
