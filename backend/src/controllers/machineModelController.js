const machineModelService = require('../services/machineModelService');

const listModels = async (req, res, next) => {
  try {
    const data = await machineModelService.listModels();
    res.json({ success: true, message: 'Machine models retrieved', data });
  } catch (err) {
    next(err);
  }
};

const getModel = async (req, res, next) => {
  try {
    const data = await machineModelService.getModel(req.params.id);
    res.json({ success: true, message: 'Machine model retrieved', data });
  } catch (err) {
    next(err);
  }
};

const createModel = async (req, res, next) => {
  try {
    const data = await machineModelService.createModel(req.body);
    res.status(201).json({ success: true, message: 'Machine model created', data });
  } catch (err) {
    next(err);
  }
};

const updateModel = async (req, res, next) => {
  try {
    const data = await machineModelService.updateModel(req.params.id, req.body);
    res.json({ success: true, message: 'Machine model updated', data });
  } catch (err) {
    next(err);
  }
};

const removeModel = async (req, res, next) => {
  try {
    const data = await machineModelService.removeModel(req.params.id);
    res.json({ success: true, message: 'Machine model deactivated', data });
  } catch (err) {
    next(err);
  }
};



module.exports = {
  listModels,
  getModel,
  createModel,
  updateModel,
  removeModel,
};
