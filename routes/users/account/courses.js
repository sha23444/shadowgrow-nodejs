var express = require("express");
var router = express.Router();

const CourseControllers = require("../../../controllers/user/account/courses");
const authenticateUser = require("../../../middlewars/authenticateToken");

router.get("/list", authenticateUser, CourseControllers.getCourses);
router.get("/:course_id", authenticateUser, CourseControllers.getCourseDetails);
router.get("/:course_id/content", authenticateUser, CourseControllers.getCourseContent);
router.get("/lecture/:lectureId", authenticateUser, CourseControllers.getLectureDetailsById);

module.exports = router;
