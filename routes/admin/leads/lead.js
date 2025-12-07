var express = require("express");
var router = express.Router();

const LeadController = require("../../../controllers/admin/leads/lead");

router.get("/", LeadController.getLeads);
router.post("/add", LeadController.addLead);
router.put("/update", LeadController.updateLead);
router.delete("/delete/:lead_id", LeadController.deleteLead);

module.exports = router;
