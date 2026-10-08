const express = require('express');
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validateLogin } = require('../validators/authValidator');

const router = express.Router();

router.post('/login', validateLogin, authController.login);
router.get('/me', authenticate, authController.me);
router.put('/me/profile', authenticate, authController.updateProfile);
router.put('/password', authenticate, authController.changePassword);

module.exports = router;