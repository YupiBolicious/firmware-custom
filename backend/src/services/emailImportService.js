const path = require('path');
const crypto = require('crypto');
const gmailService = require('./gmailService');
const uploadService = require('./workOrderUploadService');
const workOrderService = require('./workOrderService');
const userRepository = require('../repositories/userRepository');

const DEFAULT_QUERY = 'has:attachment {filename:pdf filename:docx}';
const WO_FILENAME = /^WO(\d+).*\.((pdf)|(docx))$/i;

const parseGmailAttachment = async (message, attachment) => {
  const filename = attachment.filename || '';
  const match = filename.match(WO_FILENAME);

    const ext = path.extname(filename).toLowerCase();
  if (!['.pdf', '.docx'].includes(ext)) {
    throw new Error('Format file tidak didukung');
  }

  // Mengambil bytes dari Gmail ke memory saja; belum menyimpan file atau membuat WO.
  const buffer = await gmailService.getAttachment(
    message.id,
    attachment.attachmentId
  );

  const fields = ext === '.docx'
    ? await uploadService.parseWorkOrderDocx(buffer)
    : await uploadService.parseWorkOrderPdf(buffer);

  if (!fields.wo_number) {
    throw new Error('Nomor WO tidak ditemukan di dalam dokumen');
  }

  if (!Number.isInteger(fields.revision) || fields.revision < 0) {
    throw new Error('Revisi WO tidak ditemukan atau tidak valid');
  }

  const filenameWoNumber = match[1];
  const documentWoNumber = String(fields.wo_number).replace(/\D/g, '');

  if (filenameWoNumber !== documentWoNumber) {
    throw new Error('Nomor WO pada nama file berbeda dari nomor dalam dokumen');
  }

  return {
    message_id: message.id,
    filename,
    extracted: fields,
    warnings: [
      ...(!fields.customer ? ['customer'] : []),
      ...(!fields.model_code ? ['model_code'] : []),
      ...(!fields.serial_numbers.length ? ['serial_numbers'] : []),
    ],
    payload: uploadService.toCreatePayload(fields),
  };
}
const extractEmailAddress = (header = '') => {
  const match = String(header).match(/<([^>]+)>/);
  const email = (match ? match[1] : header).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

const sha256 = (buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

const parseAttachment = async (message, attachment) => {
  const buffer = await gmailService.getAttachment(message.id, attachment.attachmentId);
  const ext = path.extname(attachment.filename).toLowerCase();

  const fields = ext === '.docx'
    ? await uploadService.parseWorkOrderDocx(buffer)
    : await uploadService.parseWorkOrderPdf(buffer);

  if (!fields.wo_number) throw new Error('WO number tidak ditemukan di dokumen');
  if (!Number.isInteger(fields.revision) || fields.revision < 0) {
    throw new Error('Revisi WO tidak ditemukan atau tidak valid');
  }

  const filenameMatch = attachment.filename.match(WO_FILENAME);
  if (!filenameMatch) throw new Error('Nama lampiran bukan format WO + nomor + PDF/DOCX');

  const filenameWoNumber = filenameMatch[1];
  if (String(fields.wo_number).replace(/\D/g, '') !== filenameWoNumber) {
    throw new Error('Nomor WO pada nama file berbeda dari nomor WO di dokumen');
  }

  return { buffer, fields, hash: sha256(buffer) };
};

const importFromGmail = async ({
  q = DEFAULT_QUERY,
  max = 20,
  user,
  ip_address,
} = {}) => {
  const messages = await gmailService.listEmails({ q, maxResults: max });
  const result = { imported: [], skipped: [], failed: [] };

  for (const message of messages) {
    const messageId = message.id;
    let filename = null;

    try {
      const senderEmail = extractEmailAddress(message.from);
      if (!senderEmail) throw new Error('Alamat pengirim tidak valid');

      const sender = await userRepository.findByEmailId(senderEmail);
      if (!sender) {
        result.skipped.push({
          message_id: messageId,
          from: senderEmail,
          reason: 'Pengirim tidak terdaftar atau user tidak aktif',
        });
        continue;
      }

      if (!sender.roles.includes('PM')) {
        result.skipped.push({
          message_id: messageId,
          from: senderEmail,
          reason: 'Pengirim terdaftar, tetapi tidak memiliki role PM',
        });
        continue;
      }

      const candidates = (message.attachments || [])
        .filter((attachment) => WO_FILENAME.test(attachment.filename || ''))
        .sort((a, b) => a.filename.localeCompare(b.filename));

      if (!candidates.length) {
        result.skipped.push({
          message_id: messageId,
          from: senderEmail,
          reason: 'Tidak ada lampiran PDF/DOCX dengan nama WO + nomor',
        });
        continue;
      }

      // Satu lampiran per email. Kandidat pertama dipilih secara deterministik.
      const attachment = candidates[0];
      filename = attachment.filename;

      const parsed = await parseAttachment(message, attachment);
      const payload = uploadService.toCreatePayload(parsed.fields);

      let wo;
      let action;

      try {
        wo = await workOrderService.createWorkOrder({
          ...payload,
          overwrite: false,
          created_by: sender.id,
          roles: sender.roles,
          ip_address,
        });
        action = 'created';
      } catch (err) {
        const duplicate = err.statusCode === 409
          && err.data?.code === 'WO_DUPLICATE';

        if (!duplicate) throw err;

        const oldRevision = Number(err.data.existing_revision);
        const newRevision = Number(payload.revision);

        if (!Number.isInteger(newRevision) || newRevision <= oldRevision) {
          result.skipped.push({
            message_id: messageId,
            filename,
            wo_number: payload.wo_number,
            revision: newRevision,
            reason: `WO sudah ada pada revisi ${oldRevision}; revisi masuk harus lebih baru`,
          });
          continue;
        }

        // Service/repository yang ada memeriksa status terkunci dan revisi secara atomik.
        wo = await workOrderService.createWorkOrder({
          ...payload,
          overwrite: true,
          created_by: sender.id,
          roles: sender.roles,
          ip_address,
        });
        action = 'revised';
      }

      // Analyze dapat gagal setelah WO tersimpan; hasilnya dilaporkan terpisah.
      try {
        const analysis = await workOrderService.analyzeWorkOrder(wo.id, {
          user_id: sender.id,
          roles: sender.roles,
          ip_address,
        });

        result.imported.push({
          message_id: messageId,
          filename,
          file_sha256: parsed.hash,
          action,
          work_order_id: wo.id,
          wo_number: wo.wo_number,
          revision: wo.revision,
          status: 'ANALYZED',
          analysis: analysis.summary,
        });
      } catch (err) {
        result.imported.push({
          message_id: messageId,
          filename,
          file_sha256: parsed.hash,
          action,
          work_order_id: wo.id,
          wo_number: wo.wo_number,
          revision: wo.revision,
          status: 'ANALYZE_FAILED',
          reason: err.message,
        });
      }
    } catch (err) {
      result.failed.push({
        message_id: messageId,
        filename,
        reason: err.message,
      });
    }
  }

  return {
    scanned: messages.length,
    imported_count: result.imported.length,
    skipped_count: result.skipped.length,
    failed_count: result.failed.length,
    ...result,
  };
};

module.exports = { parseGmailAttachment, importFromGmail };