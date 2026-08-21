const complexityRepository = require('../repositories/complexityRepository');

const list = async (req, res, next) => {
  try {
    const data = await complexityRepository.findAll();
    res.json({ success: true, message: 'Complexity levels retrieved', data });
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const data = await complexityRepository.findById(req.params.id);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Complexity level not found', errors: [] });
    }
    res.json({ success: true, message: 'Complexity level retrieved', data });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, getById };