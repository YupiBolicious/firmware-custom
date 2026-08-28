const authService = require('../services/authService');

const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: ['identifier (email or username) and password are required'],
      });
    }
    const data = await authService.login({ identifier, password });
    res.json({ success: true, message: 'Login successful', data });
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const data = await authService.changePassword({
      userId: req.user.id,
      current_password: req.body.current_password,
      new_password: req.body.new_password,
      actorId: req.user.id,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Password updated', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, changePassword };