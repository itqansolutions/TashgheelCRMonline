const express = require('express');
const router = express.Router();
const jobTitlesController = require('../controllers/jobTitlesController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', jobTitlesController.getJobTitles);
router.post('/', jobTitlesController.createJobTitle);
router.put('/:id', jobTitlesController.updateJobTitle);
router.delete('/:id', jobTitlesController.deleteJobTitle);

module.exports = router;
