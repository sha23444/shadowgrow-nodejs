var express = require("express");
var router = express.Router();

const LabelsController = require("../../../controllers/admin/leads/label");

router.get("/", LabelsController.getLabels);
router.post("/add", LabelsController.addLabel);
router.put("/update", LabelsController.updateLabel);
router.delete("/delete/:id", LabelsController.deleteLabel);

module.exports = router;
