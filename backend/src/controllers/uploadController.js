const workOrderService = require('../services/workOrderService');
const workOrderUploadService = require('../services/workOrderUploadService');
const { ApiError } = require('../middleware/errorHandler');

const previewWorkOrder = async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, 'No file uploaded');

    // 1. Parse file only — nothing is written until the user confirms the preview.
    const path = require('path');
    const ext = path.extname(req.file.originalname).toLowerCase();
    let fields;
    if (ext === '.docx') {
      fields = await workOrderUploadService.parseWorkOrderDocx(req.file.buffer);
    } else {
      fields = await workOrderUploadService.parseWorkOrderPdf(req.file.buffer);
    }

    if (!fields.wo_number) {
      throw new ApiError(422, 'Could not extract required fields', ['wo_number']);
    }

    // 2. Evaluasi Warnings
    const warnings = [];
    if (!fields.customer) warnings.push('customer');
    if (!fields.model_code) warnings.push('model_code');
    if (!fields.serial_numbers.length) warnings.push('serial_numbers');
    if (!Number.isInteger(fields.revision) || fields.revision < 0) warnings.push('revision');

    // 3. Preview only — nothing is written until the user confirms.
    return res.json({
      success: true,
      message: `${ext === '.docx' ? 'DOCX' : 'PDF'} parsed for preview`,
      extracted: fields,
      warnings,
    });
  } catch (err) {
    next(err);
  }
};

const confirmUploadWorkOrder = async (req, res, next) => {
  try {
    const {
      wo_number,
      revision,
      customer,
      model_code,
      serial_numbers = [],
      customize_with = [],
      overwrite = false,
    } = req.body || {};

    if (!wo_number || typeof wo_number !== 'string' || !wo_number.trim()) {
      throw new ApiError(422, 'Work order number is required to import', ['wo_number']);
    }

    // Evaluasi Warnings
    const warnings = [];
    if (!customer) warnings.push('customer');
    if (!model_code) warnings.push('model_code');
    if (!serial_numbers || serial_numbers.length === 0) warnings.push('serial_numbers');

    // Mapping Groups (Model & Serial Numbers)
    const groups = model_code
      ? (serial_numbers && serial_numbers.length
        ? serial_numbers.map((sn) => ({
            machine_model_id: model_code,
            serial_number: sn,
          }))
        : [{ machine_model_id: model_code }])
      : [];

    // Mapping Customize Items (title + quantity, defaulted to 1)
    const items = (customize_with || []).map((item) => ({
      title: item.title,
      quantity: Number.isInteger(item.quantity) && item.quantity >= 1 ? item.quantity : 1,
    }));

    // Existing work orders require an explicit overwrite confirmation.
    const wo = await workOrderService.createWorkOrder({
      wo_number: wo_number.trim(),
      revision,
      customer: customer || null,
      groups,
      items,
      overwrite: overwrite === true,
      created_by: req.user.id,
      roles: req.user.roles,
      ip_address: req.ip,
    });

    const revised = Boolean(wo.revised);
    return res.status(revised ? 200 : 201).json({
      success: true,
      message: revised
        ? `Work order ${wo.wo_number} rewritten to draft`
        : (warnings.length ? 'Work order imported with warnings' : 'Successfully uploaded work order'),
      data: wo,
      warnings,
      extracted: {
        wo_number: wo.wo_number,
        revision: wo.revision,
        model_code,
        serial_numbers,
        customize_with: items,
        customer,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
    previewWorkOrder, confirmUploadWorkOrder
};