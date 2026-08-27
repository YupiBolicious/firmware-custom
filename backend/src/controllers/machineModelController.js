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

const listVersions = async (req, res, next) => {
  try {
    const data = await machineModelService.listVersions(req.params.id);
    res.json({ success: true, message: 'Versions retrieved', data });
  } catch (err) {
    next(err);
  }
};

const createVersion = async (req, res, next) => {
  try {
    const data = await machineModelService.createVersion(req.params.id, req.body);
    res.status(201).json({ success: true, message: 'Version created', data });
  } catch (err) {
    next(err);
  }
};

const updateVersion = async (req, res, next) => {
  try {
    const data = await machineModelService.updateVersion(req.params.versionId, req.body);
    res.json({ success: true, message: 'Version updated', data });
  } catch (err) {
    next(err);
  }
};

const removeVersion = async (req, res, next) => {
  try {
    const data = await machineModelService.removeVersion(req.params.versionId);
    res.json({ success: true, message: 'Version deactivated', data });
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
  listVersions,
  createVersion,
  updateVersion,
  removeVersion,
};
