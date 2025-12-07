const express = require('express');
const router = express.Router();

const BlogsController = require('../../controllers/admin/blogs/blogs');
const CategoriesController = require('../../controllers/admin/blogs/categories');
const TagsController = require('../../controllers/admin/blogs/tags');


// Blog routes
router.post('/create', BlogsController.createBlog);
router.get('/list', BlogsController.getAllBlogs);

// Tags routes (declare BEFORE '/:id' to avoid route conflicts)
router.post('/tags/create', TagsController.createTag);
router.get('/tags', TagsController.getTags);
router.delete('/tags/delete/:id', TagsController.deleteTag);

// Blog ID-specific routes
router.get('/:id', BlogsController.getBlogById);
router.put('/:id', BlogsController.updateBlog);
router.patch('/:id/status', BlogsController.updateBlogStatus);
router.delete('/delete/:id', BlogsController.deleteBlog);

// Create a new category

router.get('/categories/list', CategoriesController.getCategories);
router.post('/categories/add', CategoriesController.createCategory);
router.put('/categories/update', CategoriesController.updateCategory);
router.delete('/categories/delete/:id', CategoriesController.deleteCategory);
router.get('/categories/sub-categories', CategoriesController.getSubcategories);

router.get('/categories/all', CategoriesController.getAllCategoriesWithSubcategories);

module.exports = router;
