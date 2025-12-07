const express = require('express');
const router = express.Router();
const ContactController = require('../../controllers/admin/contact');

// Route to create a contact query
router.post('/create', ContactController.createContactQuery);

// Route to get all contact queries
router.get('/', ContactController.getContactQueries);

module.exports = router;
