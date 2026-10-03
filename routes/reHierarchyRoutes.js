const express = require('express');
const router = express.Router();
const reHierarchyController = require('../controllers/reHierarchyController');
const authMiddleware = require('../middleware/auth');
const branchScope = require('../middleware/branchScope');

router.use(authMiddleware);
router.use(branchScope);

// Developers
router.get('/developers', reHierarchyController.getDevelopers);
router.post('/developers', reHierarchyController.createDeveloper);
router.delete('/developers/:id', reHierarchyController.deleteDeveloper);

// Projects
router.get('/projects', reHierarchyController.getProjects);
router.post('/projects', reHierarchyController.createProject);
router.delete('/projects/:id', reHierarchyController.deleteProject);

// Phases
router.get('/phases', reHierarchyController.getPhases);
router.post('/phases', reHierarchyController.createPhase);
router.delete('/phases/:id', reHierarchyController.deletePhase);

// Buildings
router.get('/buildings', reHierarchyController.getBuildings);
router.post('/buildings', reHierarchyController.createBuilding);
router.delete('/buildings/:id', reHierarchyController.deleteBuilding);

// Navigation Tree
router.get('/tree', reHierarchyController.getHierarchyTree);

module.exports = router;
