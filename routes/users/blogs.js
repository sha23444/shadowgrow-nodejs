const express = require('express');
const router = express.Router();
const BlogsController = require('../../controllers/user/blogs');

router.get('/', BlogsController.getAllBlogs);
router.get('/details/:slug', BlogsController.getBlogBySlug);
router.get('/featured', BlogsController.getFeaturedBlog);
router.get('/recent', BlogsController.getRecentBlogs);
router.get('/top', BlogsController.getTopBlogsByViews);
router.get('/search', BlogsController.searchBlogs);
router.post('/related', BlogsController.getRelatedBlogs);
router.post("/comments", BlogsController.getBlogComments);

router.post('/like', BlogsController.likeBlog);
router.post('/unlike', BlogsController.unlikeBlog);
router.post('/comment', BlogsController.commentOnBlog);
router.post('/reply', BlogsController.replyToComment);

router.get('/tags', BlogsController.getBlogTags);
router.get('/categories', BlogsController.getBlogCategories);

router.get('/tags/:tag', BlogsController.getBlogByTag);
router.get('/categories/:category', BlogsController.getBlogByCategory);


module.exports = router;
