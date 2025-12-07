const express = require('express');
const router = express.Router();

const AttributeController = require('../../controllers/user/productAttributes');
const CategoryController = require('../../controllers/user/productCategories');
const TagController = require('../../controllers/admin/productTags');

const { smartCache } = require("../../config/smart-cache");

router.get('/attributes', smartCache, AttributeController.getAllAttributes);

router.get('/categories', smartCache, CategoryController.listCategories);
router.get('/categories/with-count', smartCache, CategoryController.getCategoriesWithProductCount);
router.get('/categories/:categoryId', smartCache, CategoryController.getSubcategories)  

router.get("/tags", smartCache, TagController.getAllTags); // List all tags
router.get("/tags/with-count", smartCache, TagController.getTagsWithProductCount); // List tags with product counts
router.get("/products/:productId/tags", smartCache, TagController.getProductTags); // Get tags for a specific product


module.exports = router;
