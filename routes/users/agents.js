var express = require('express');
var router = express.Router();

const AgentsController = require('../../controllers/user/agents');

router.get('/', AgentsController.getAgents);
router.get('/stats', AgentsController.getAgentStats);
router.get('/countries', AgentsController.getCountries);


module.exports = router;
 