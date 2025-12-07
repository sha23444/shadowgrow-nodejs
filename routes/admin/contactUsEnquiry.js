var express = require('express');
var router = express.Router();

const ContactUsEnquiryController = require('../../controllers/admin/contactUsEnquiry');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.get('/', authenticateUser, ContactUsEnquiryController.getList);
router.post('/contact-us', authenticateUser, ContactUsEnquiryController.contactUsEnquiry);

module.exports = router;
 