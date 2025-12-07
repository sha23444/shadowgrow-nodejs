var express = require('express');
var router = express.Router();
const SEO = require('../../controllers/user/seo');

router.get('/', SEO.getSEOData);


module.exports = router;
