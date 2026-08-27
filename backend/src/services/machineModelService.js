const machineModelRepository = require('../repositories/machineModelRepository');
const { ApiError } = require('../middleware/errorHandler');

const listModels = async () => {
  return machineModelRepository.findAllModels();
};

const getModel = async (id) => {
  const model = await machineModelRepository.findModelById(id);
  if (!model) throw new ApiError(404, 'Machine model not found');
  const versions = await machineModelRepository.findVersionsByModelId(id);
  return { ...model, versions };
};

const createModel = async (data) => {
  return machineModelRepository.createModel(data);
};

const updateModel = async (id, data) => {
  const model = await machineModelRepository.updateModel(id, data);
  if (!model) throw new ApiError(404, 'Machine model not found');
  return model;
};

const removeModel = async (id) => {
  const model = await machineModelRepository.removeModel(id);
  if (!model) throw new ApiError(404, 'Machine model not found');
  return model;
};

const listVersions = async (modelId) => {
  const model = await machineModelRepository.findModelById(modelId);
  if (!model) throw new ApiError(404, 'Machine model not found');
  return machineModelRepository.findVersionsByModelId(modelId);
};

const createVersion = async (modelId, data) => {
  const model = await machineModelRepository.findModelById(modelId);
  if (!model) throw new ApiError(404, 'Machine model not found');
  return machineModelRepository.createVersion({ ...data, machine_model_id: modelId });
};

const updateVersion = async (id, data) => {
  const version = await machineModelRepository.updateVersion(id, data);
  if (!version) throw new ApiError(404, 'Version not found');
  return version;
};

const removeVersion = async (id) => {
  const version = await machineModelRepository.removeVersion(id);
  if (!version) throw new ApiError(404, 'Version not found');
  return version;
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
