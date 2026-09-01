const userService = require('../services/userService');

const list = async (req, res, next) => {
  try {
    const data = await userService.listUsers();
    res.json({ success: true, message: 'Users retrieved', data });
  } catch (err) {
    next(err);
  }
};

const listPmUsers = async (req, res, next) => {
  try {
    const data = await userService.listPmUsers();
    res.json({ success: true, message: 'PM users retrieved', data });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = await userService.createUser({
      actorId: req.user.id,
      body: req.body,
      ip_address: req.ip,
    });
    res.status(201).json({ success: true, message: 'User created', data });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const data = await userService.updateUser({
      actorId: req.user.id,
      id: req.params.id,
      body: req.body,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'User updated', data });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const data = await userService.resetPassword({
      actorId: req.user.id,
      id: req.params.id,
      body: req.body,
      ip_address: req.ip,
    });
    res.json({ success: true, message: 'Password reset', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, listPmUsers, create, update, resetPassword };