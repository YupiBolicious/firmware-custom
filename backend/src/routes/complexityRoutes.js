const express = require('express');
const complexityController = require('../controllers/complexityController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', complexityController.list);
router.get('/:id', complexityController.getById);

module.exports = router;