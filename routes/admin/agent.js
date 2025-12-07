var express = require('express');
var router = express.Router();
const AgentController = require('../../controllers/admin/agent');
const authenticateUser = require('../../middlewars/authenticateAdmin');

router.post('/create', authenticateUser, AgentController.addAgent);
router.get('/', authenticateUser, AgentController.getAgents);
router.put('/update/:id', authenticateUser, AgentController.updateAgent);
router.delete('/delete/:id', authenticateUser, AgentController.deleteAgent);
router.put("/change-position", authenticateUser, AgentController.reorderAgentPosition)
router.get('/countries', authenticateUser, AgentController.getCountries);


module.exports = router;
