const complexityService = require('../services/complexityService');

const list = async (req, res, next) => {
  try {
    const data = await complexityService.list();
    res.json({ success: true, message: 'Complexity levels retrieved', data });
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const data = await complexityService.get(req.params.id);
    res.json({ success: true, message: 'Complexity level retrieved', data });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = await complexityService.create(req.body);
    res.status(201).json({ success: true, message: 'Complexity level created', data });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const data = await complexityService.update(req.params.id, req.body);
    res.json({ success: true, message: 'Complexity level updated', data });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const data = await complexityService.remove(req.params.id);
    res.json({ success: true, message: 'Complexity level deactivated', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, getById, create, update, remove };