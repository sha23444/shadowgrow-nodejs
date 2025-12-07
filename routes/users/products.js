const express = require("express");
const router = express.Router();

const ProductController = require("../../controllers/user/products");
const { smartCache } = require("../../config/smart-cache");

// All products (includes services)
router.get("/all", ProductController.getProductList);

// Digital and Physical products only (excludes services)
router.get("/", smartCache, ProductController.getProductListDigitalPhysical);

// Other routes with caching
router.get("/price-ranges", smartCache, ProductController.getPriceRanges);
router.get("/related-products/:slug", smartCache, ProductController.getRelatedProducts);
router.get("/category/:slug", smartCache, ProductController.getProductsByCategory);
router.get("/tag/:slug", smartCache, ProductController.getProductsByTag);

// Product details with caching
router.get("/:slug", smartCache, ProductController.getProductDetails);

module.exports = router;
