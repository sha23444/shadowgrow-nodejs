const express = require('express');
const router = express.Router();

const ProductController = require('../../controllers/admin/products');
const VariantController = require('../../controllers/admin/productVariants');
const AttributeController = require('../../controllers/admin/productAttributes');
const CategoryController = require('../../controllers/admin/productCategories');
const TagController = require('../../controllers/admin/productTags');

// Product routes
router.get('/list', ProductController.getProductList);
router.get('/:slug', ProductController.getProductDetails);
router.get('/details/:id', ProductController.getProductDetailsById);
router.post('/create', ProductController.addProduct);
router.put('/update/:productId', ProductController.updateProduct);
router.delete('/delete/:productId', ProductController.deleteProduct);


// Variant routes
router.post('/variants/create', VariantController.addVariant);
router.get('/variants/list', VariantController.getAllVariants);
router.put('/variants/:variantId', VariantController.updateVariant);
router.delete('/variants/:variantId', VariantController.deleteVariant);
router.get('/variants/:variantId', VariantController.getVariantById);
router.get('/:productId/variants', VariantController.getProductVariants);

// Attribute routes
router.get('/attributes/list', AttributeController.getAllAttributes);
router.post('/attributes/add', AttributeController.addAttribute);
router.put('/attributes/update', AttributeController.updateAttribute);
router.delete('/attributes/delete/:id', AttributeController.deleteAttribute);

// Display order routes
router.put('/attributes/update-display-order', AttributeController.updateAttributeDisplayOrder);
router.put('/attributes/update-multiple-display-order', AttributeController.updateMultipleAttributesDisplayOrder);

router.get('/attributes/list/values/:id', AttributeController.getAttributesValues);
router.post('/attributes/values/add', AttributeController.addAttributeValue);
router.delete('/attributes/values/delete/:id', AttributeController.deleteAttributeValues);
router.put('/attributes/values/update', AttributeController.updateAttributeValue);

// Categories
router.get('/categories/list', CategoryController.listCategories);
router.get('/categories/hierarchy', CategoryController.getCategoriesHierarchy);
router.post('/categories/create', CategoryController.addCategory);  
router.get('/categories/:categoryId', CategoryController.getSubcategories)  
router.delete('/categories/delete/:categoryId', CategoryController.deleteCategory);
router.put('/categories/update/:categoryId', CategoryController.updateCategory);

// Tags
router.get("/tags/list", TagController.getAllTags); // List all tags
router.post("/tags", TagController.addTag); // Add a new tag
router.delete("/tags/delete/:tagId", TagController.deleteTag); // Delete a tag by ID
router.put("/tags/update/:tagId", TagController.updateTag); // Update a tag by ID

router.get("/products/:productId/tags", TagController.getProductTags); // Get tags for a specific product
router.post("/products/:productId/tags",TagController.addProductTags); // Add tags to a specific product


module.exports = router;
