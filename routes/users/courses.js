var express = require("express");
var router = express.Router();

const CourseController = require("../../controllers/user/courses");
const CategoryController = require("../../controllers/admin/courseCategories");
const TagController = require("../../controllers/admin/courseTags");

// Categories
router.get("/categories/list", CategoryController.listCategories);

// Tags
router.get("/tags/list", TagController.getAllTags);

router.get("/", CourseController.getCourseList);
router.get("/:slug", CourseController.getCourseDetails);
router.get("/:courseId/content", CourseController.getCourseContent);

module.exports = router;
