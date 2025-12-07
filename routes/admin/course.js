var express = require("express");
var router = express.Router();

const CourseController = require("../../controllers/admin/courses");
const CategoryController = require("../../controllers/admin/courseCategories");
const TagController = require("../../controllers/admin/courseTags");
const TopicController = require("../../controllers/admin/courseTopic");
const ContentController = require("../../controllers/admin/courseContent");


// Categories
router.get("/categories/list", CategoryController.listCategories);
router.post("/categories/create", CategoryController.addCategory);
router.get("/categories/:categoryId", CategoryController.getSubcategories);
router.delete(
  "/categories/delete/:categoryId",
  CategoryController.deleteCategory
);
router.put("/categories/update/:categoryId", CategoryController.updateCategory);

// Tags
router.get("/tags/list", TagController.getAllTags); // List all tags
router.post("/tags", TagController.addTag); // Add a new tag
router.delete("/tags/delete/:tagId", TagController.deleteTag); // Delete a tag by ID
router.put("/tags/update/:tagId", TagController.updateTag); // Update a tag by ID

// Routes for course topics

router.post("/topics/add", TopicController.createTopic);
router.put("/course/topics", TopicController.updateTopic);
router.delete("/course/topics/:topicId", TopicController.deleteTopic);
                                                            
// Routes for topic content
router.post("/topics/:topicId/content", ContentController.createContent);
router.put("/content/:contentId", ContentController.updateContent);
router.delete("/content/:contentId", ContentController.deleteContent);

router.get("/:courseId/content", ContentController.getCourseContent);

router.post("/", CourseController.createCourse);
router.get("/list", CourseController.getCourseList);
router.get("/:courseId", CourseController.getCourseDetails);
router.put("/:courseId", CourseController.updateCourse);
router.delete("/:courseId", CourseController.deleteCourse);

module.exports = router;
