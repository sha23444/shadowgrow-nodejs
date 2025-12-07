var express = require("express");
var router = express.Router();

const CourseControllers = require("../../../controllers/admin/user/courses");

router.get("/",  CourseControllers.getCourses);

module.exports = router;
