const authService = require('../services/authService');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: ['username and password are required'],
      });
    }
    const data = await authService.login({ username, password });
    res.json({ success: true, message: 'Login successful', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { login };