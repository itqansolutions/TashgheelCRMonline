const express = require('express');
const router = express.Router();
const controller = require('../controllers/salesTeamController');
const authMiddleware = require('../middleware/auth');
const { authorize } = require('../middleware/roleMiddleware');

// Ensure authentication
router.use(authMiddleware);

// Eligible employees for team assignment (existing active users only)
router.get('/eligible-employees', controller.getEligibleEmployees);

// Sales Teams CRUD
router.get('/', controller.getSalesTeams);
router.post('/', authorize(['admin', 'manager', 'supervisor']), controller.createSalesTeam);
router.get('/:id', controller.getSalesTeamById);
router.put('/:id', authorize(['admin', 'manager', 'supervisor']), controller.updateSalesTeam);
router.delete('/:id', authorize(['admin', 'manager', 'supervisor']), controller.deleteSalesTeam);

// Sales Team Members Management
router.post('/:id/members', authorize(['admin', 'manager', 'supervisor']), controller.addTeamMember);
router.patch('/:id/members/:userId', controller.updateTeamMember);
router.delete('/:id/members/:userId', authorize(['admin', 'manager', 'supervisor']), controller.removeTeamMember);

module.exports = router;
