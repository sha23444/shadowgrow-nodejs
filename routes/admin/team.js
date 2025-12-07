var express = require('express');
var router = express.Router();

const TeamController = require('../../controllers/admin/teams');
const authenticateUser = require('../../middlewars/authenticateAdmin');

// Core CRUD operations
router.get('/', authenticateUser, TeamController.getTeamMembers);
router.get('/:id', authenticateUser, TeamController.getTeamMember);
router.post('/add', authenticateUser, TeamController.createTeamMember);
router.put('/positions/update', authenticateUser, TeamController.updateTeamPositions);
router.put('/update/:id', authenticateUser, TeamController.updateTeamMember);
router.delete('/delete/:id', authenticateUser, TeamController.deleteTeamMember);

// New features
router.post('/bulk-actions', authenticateUser, TeamController.bulkTeamActions);
router.get('/analytics/overview', authenticateUser, TeamController.getTeamAnalytics);

module.exports = router;
