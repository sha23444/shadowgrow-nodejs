var express = require('express');
var router = express.Router();

const LocationController = require('../../controllers/api/location');

router.get('/', LocationController.getUserLocation);

module.exports = router;
 