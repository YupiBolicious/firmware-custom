const complexityRepository = require('../repositories/complexityRepository');
const { ApiError } = require('../middleware/errorHandler');

const HOUR_FIELDS = ['requirement_review_h', 'code_development_h', 'peer_review_fixing_h', 'bench_testing_h', 'unit_testing_h'];

const list = async () => {
  return complexityRepository.findAll();
};

const get = async (id) => {
  const level = await complexityRepository.findById(id);
  if (!level) throw new ApiError(404, 'Complexity level not found');
  return level;
};

const normalizeHours = (body) => {
  const hours = {};
  for (const field of HOUR_FIELDS) {
    if (body[field] === undefined || body[field] === null || body[field] === '') continue;
    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < 0) {
      throw new ApiError(400, `${field} must be a non-negative number`);
    }
    hours[field] = value;
  }
  return hours;
};

const create = async (body) => {
  const code = String(body.code || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  if (!code) throw new ApiError(400, 'Code is required');
  if (!name) throw new ApiError(400, 'Name is required');
  const existing = await complexityRepository.findByCode(code);
  if (existing) throw new ApiError(409, 'Complexity level code already exists');
  const hours = normalizeHours(body);
  return complexityRepository.create({
    code,
    name,
    description: body.description,
    requirement_review_h: hours.requirement_review_h ?? 0,
    code_development_h: hours.code_development_h ?? 0,
    peer_review_fixing_h: hours.peer_review_fixing_h ?? 0,
    bench_testing_h: hours.bench_testing_h ?? 0,
    unit_testing_h: hours.unit_testing_h ?? 0,
  });
};

const update = async (id, body) => {
  const level = await complexityRepository.findById(id);
  if (!level) throw new ApiError(404, 'Complexity level not found');

  let code;
  if (body.code !== undefined && String(body.code).trim() !== '') {
    code = String(body.code).trim().toUpperCase();
    const existing = await complexityRepository.findByCode(code);
    if (existing && existing.id !== Number(id)) {
      throw new ApiError(409, 'Complexity level code already exists');
    }
  }

  const hours = normalizeHours(body);

  let name;
  if (body.name !== undefined) {
    name = String(body.name).trim();
    if (!name) throw new ApiError(400, 'Name is required');
  }

  let is_active;
  if (body.is_active !== undefined) {
    is_active = body.is_active === true || body.is_active === 'true';
  }

  return complexityRepository.update(id, {
    code,
    name,
    description: body.description,
    ...hours,
    is_active,
  });
};

const remove = async (id) => {
  const level = await complexityRepository.findById(id);
  if (!level) throw new ApiError(404, 'Complexity level not found');
  return complexityRepository.remove(id);
};

module.exports = { list, get, create, update, remove };