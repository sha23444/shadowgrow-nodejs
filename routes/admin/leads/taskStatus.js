var express = require("express");
var router = express.Router();

const TaskStatusController = require("../../../controllers/admin/leads/taskStatus");

router.get("/", TaskStatusController.getTaskStatuses);
router.post("/add", TaskStatusController.addTaskStatus);
router.put("/update", TaskStatusController.updateTaskStatus);
router.delete("/delete/:id", TaskStatusController.deleteTaskStatus);

module.exports = router;
