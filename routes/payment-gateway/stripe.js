const express = require('express');
const router = express.Router();

const StripeController = require('../../controllers/payment-gateway/stripe');

// Webhook endpoint (must be before express.json() middleware)
router.post('/webhook', express.raw({type: 'application/json'}), StripeController.webhookHandler);

// Regular API endpoints
router.post('/create-session', StripeController.createSession);
router.get('/payments/:id', StripeController.fetchPayment);
router.get('/sessions', StripeController.fetchSessions);

module.exports = router;
