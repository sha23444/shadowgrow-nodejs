const express = require("express");
const router = express.Router();

const userAuthRouter = require("./users/auth");
const digitalFilesRouter = require("./users/files");
const downloadPackagesRouter = require("./users/downloadPackages");
const cartRouter = require('./users/cart');
const guestCartRouter = require('./users/cart-guest');
const paymentRouter = require('./payment-gateway/index');
const agentRouter = require('./users/agents');
const teamsRouter = require('./users/teams');
const blogsRouter = require('./users/blogs');
const videosRouter = require('./users/videos');
const pagesRouter = require('./users/pages');
const searchRouter = require('./users/search');
const menuRouter = require('./users/menu');
const couponRouter = require('./users/coupons');
const reviewRouter = require('./users/reviews');
const requestFileRouter = require('./users/requestFile');
const contactUsEnquiryRouter = require('./users/contactUsEnquiry');
const productsRouter = require('./users/products');
const productRouter = require('./users/product');
const walletRouter = require('./users/wallet');
const dashboardRouter = require('./users/dashboard');
const locationRouter = require("./users/location");
const currencyRouter = require("./users/currencies");
const courseRouter = require("./users/courses");
const userAccountRouter = require("./users/account/index");
const balanceTransferRouter = require("./users/balance-transfer");
const paymentGatewayRouter = require("./users/paymentGateways");
const cmsRouter = require("./users/cms");
const bannerRouter = require("./users/banner");
const socialLinksRouter = require("./users/socialLinks");
const seoRouter = require("./users/seo");
const offlinePaymentMethodsRouter = require("./users/offlinePaymentMethods");
const invoicesRouter = require("./users/invoices");
const servicesRouter = require('./users/services');

// shared
const orderRouter = require("./shared/order");

// middleware

router.use("/auth", userAuthRouter);
router.use("/services", servicesRouter);
router.use("/", digitalFilesRouter); // File Manager
router.use("/download-packages", downloadPackagesRouter);
router.use("/account", userAccountRouter);
router.use("/cart", cartRouter);
router.use("/cart/guest", guestCartRouter);
router.use("/payment", paymentRouter);
router.use("/agents", agentRouter);
router.use("/teams", teamsRouter);
router.use("/blogs", blogsRouter);
router.use("/videos", videosRouter);
router.use("/pages", pagesRouter);
router.use("/order", orderRouter);
router.use("/search", searchRouter);
router.use("/menu", menuRouter);
router.use("/coupons", couponRouter);
router.use("/reviews", reviewRouter);
router.use("/request-file", requestFileRouter);
router.use("/contact-us", contactUsEnquiryRouter);
router.use("/products",  productsRouter);
router.use("/product", productRouter);
router.use("/wallet", walletRouter);
router.use("/dashboard", dashboardRouter);
router.use("/currencies", currencyRouter);
router.use("/courses", courseRouter);
router.use("/balance", balanceTransferRouter);
router.use("/payment/options", paymentGatewayRouter); 
router.use("/cms", cmsRouter);
router.use("/banner", bannerRouter);
router.use("/social-links", socialLinksRouter);
router.use("/seo", seoRouter);
router.use("/offline-payment-methods", offlinePaymentMethodsRouter);
router.use("/invoices", invoicesRouter);

module.exports = router;
