const workOrderRepository = require('../repositories/workOrderRepository');
const documentRepository = require('../repositories/documentRepository');
const auditService = require('../services/auditService');
const { ApiError } = require('../middleware/errorHandler');

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.png', '.jpg', '.jpeg', '.zip', '.7z'];

const uploadDocuments = async (workOrderId, files, { user_id, description, ip_address }) => {
  const wo = await workOrderRepository.findById(workOrderId);
  if (!wo) throw new ApiError(404, 'Work order not found');
  if (wo.status !== 'PRODUCTION' && wo.status !== 'COMPLETED') {
    throw new ApiError(400, 'Work order must be in PRODUCTION or COMPLETED to upload documents');
  }

  for (const file of files) {
    const ext = require('path').extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new ApiError(400, `File type "${ext}" not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
    }
  }

  const docs = [];
  for (const file of files) {
    const doc = await documentRepository.create({
      work_order_id: workOrderId,
      filename: file.filename,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
      description: description || null,
      uploaded_by: user_id,
    });
    docs.push(doc);
  }

  await auditService.log({
    user_id,
    action: 'DOCUMENTS_UPLOADED',
    entity_type: 'WORK_ORDER',
    entity_id: workOrderId,
    details: { wo_number: wo.wo_number, count: files.length },
    ip_address,
  });

  if (wo.status === 'PRODUCTION') {
    await workOrderRepository.updateStatus(workOrderId, 'COMPLETED');
    await auditService.log({
      user_id,
      action: 'WORK_ORDER_COMPLETED',
      entity_type: 'WORK_ORDER',
      entity_id: workOrderId,
      details: { wo_number: wo.wo_number, title: wo.title, trigger: 'document_upload' },
      ip_address,
    });
  }

  return docs;
};

const listDocuments = async (workOrderId) => {
  return documentRepository.findByWorkOrderId(workOrderId);
};

const deleteDocument = async (docId, { user_id, ip_address }) => {
  const doc = await documentRepository.findById(docId);
  if (!doc) throw new ApiError(404, 'Document not found');

  const fs = require('fs');
  const filePath = require('path').join(__dirname, '..', '..', 'uploads', doc.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await documentRepository.remove(docId);
  await auditService.log({
    user_id,
    action: 'DOCUMENT_DELETED',
    entity_type: 'WORK_ORDER_DOCUMENT',
    entity_id: docId,
    details: { work_order_id: doc.work_order_id, original_name: doc.original_name },
    ip_address,
  });
  return doc;
};

module.exports = { uploadDocuments, listDocuments, deleteDocument };
