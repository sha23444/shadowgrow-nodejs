var express = require("express");
var router = express.Router();

const SourceController = require("../../../controllers/admin/leads/source");

router.get("/", SourceController.getLeadSources);
router.post("/add", SourceController.addSource);
router.put("/update", SourceController.updateSource);
router.delete("/delete/:id", SourceController.deleteSource);

module.exports = router;
