const authService = require('../services/authService');

const login = async (req, res, next) => {
  try {
    const { identifier, password } = req.body || {};
    const data = await authService.login({ identifier, password, ip_address: req.ip });
    res.json({ success: true, message: 'Login successful', data });
  } catch (err) {
    next(err);
  }
};

const me = (req, res) => {
  res.json({ success: true, message: 'Session valid', data: { user: req.user } });
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

const updateProfile = async (req, res, next) => {
  try {
    const data = await authService.updateProfile({
      userId: req.user.id,
      body: req.body,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Profile updated', data: { user: data } });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, me, changePassword, updateProfile };