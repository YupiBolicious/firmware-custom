const kbRepository = require('../repositories/kbRepository');
const classificationService = require('../services/classificationService');
const { ApiError } = require('../middleware/errorHandler');
const { validatePagination, paginatedPayload } = require('../utils/pagination');

const list = async (req, res, next) => {
  try {
    const { page, limit } = validatePagination(req.query.page, req.query.limit);
    const { search = '', fw_related = 'ALL', complexity_level = 'ALL' } = req.query;
    const result = await kbRepository.findAll({
      page, limit, search: String(search), fwRelated: String(fw_related), complexityLevel: String(complexity_level),
    });
    res.json({
      success: true,
      message: 'Knowledge base items retrieved',
      data: paginatedPayload(result.items.map(({ total, ...rest }) => rest), result.total, page, limit),
    });
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const data = await kbRepository.findById(req.params.id);
    if (!data) {
      return next(new ApiError(404, 'Knowledge base item not found'));
    }
    res.json({ success: true, message: 'Knowledge base item retrieved', data });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const data = await kbRepository.create(req.body);
    res.status(201).json({ success: true, message: 'Knowledge base item created', data });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const existing = await kbRepository.findById(req.params.id);
    if (!existing) {
      return next(new ApiError(404, 'Knowledge base item not found'));
    }
    const data = await kbRepository.update(req.params.id, req.body);
    res.json({ success: true, message: 'Knowledge base item updated', data });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const deleted = await kbRepository.remove(req.params.id);
    if (!deleted) {
      return next(new ApiError(404, 'Knowledge base item not found'));
    }
    res.json({ success: true, message: 'Knowledge base item deleted', data: deleted });
  } catch (err) {
    next(err);
  }
};

const testKbItem = async (req, res, next) => {
  try {
    const { sample_text } = req.body;
    if (typeof sample_text !== 'string' || !sample_text.trim()) {
      return next(new ApiError(400, 'sample_text is required'));
    }
    const result = await classificationService.testKbItem(req.params.id, sample_text);
    if (!result) {
      return next(new ApiError(404, 'Knowledge base item not found'));
    }
    res.json({ success: true, message: 'KB item test result', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, getById, create, update, remove, testKbItem };