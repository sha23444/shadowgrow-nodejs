var express = require("express");
var router = express.Router();

const TaskLabelController = require("../../../controllers/admin/leads/taskLabel");

router.get("/", TaskLabelController.getTaskLabels);
router.post("/add", TaskLabelController.addTaskLabel);
router.put("/update", TaskLabelController.updateTaskLabel);
router.delete("/delete/:id", TaskLabelController.deleteTaskLabel);

module.exports = router;
