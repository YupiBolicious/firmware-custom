const path = require('path');
const crypto = require('crypto');
const emailService = require('./emailService');
const uploadService = require('./workOrderUploadService');
const workOrderService = require('./workOrderService');
const userRepository = require('../repositories/userRepository');

const DEFAULT_QUERY = 'has:attachment {filename:pdf filename:docx} newer_than:1d';
const WO_FILENAME = /^WO(\d+).*\.((pdf)|(docx))$/i;

const extractEmailAddress = (header = '') => {
  const match = String(header).match(/<([^>]+)>/);
  const email = (match ? match[1] : header).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};
//in memory before parse. binary
const sha256 = (buffer) =>
  crypto.createHash('sha256').update(buffer).digest('hex');

const parseAttachment = async (message, attachment) => {
  const buffer = await emailService.getAttachment(message.id, attachment.attachmentId);
  const ext = path.extname(attachment.filename).toLowerCase();

  const fields = ext === '.docx'
    ? await uploadService.parseWorkOrderDocx(buffer)
    : await uploadService.parseWorkOrderPdf(buffer);

  return { fields, hash:sha256(buffer) };
};

//deleted later
const rejectionReason = (attachment, fields, filenameMatch) => {
  const missing = [
    !fields.wo_number && 'wo_number',
    !(Number.isInteger(fields.revision) && fields.revision >= 0) && 'revision',
    !fields.customer && 'customer',
    !fields.model_code && 'model_code',
    !(fields.customize_with || []).every((item) => item.title && item.title.trim()) && 'items.title',
  ].filter(Boolean);

  if (missing.length) return `Field wajib tidak ditemukan: ${missing.join(', ')}`;

  if (String(fields.wo_number).replace(/\D/g, '') !== filenameMatch[1]) {
    return 'Nomor WO pada nama file berbeda dari nomor di dokumen';
  }
  return null;
};

const importFromGmail = async ({
  q = DEFAULT_QUERY, max = 10, user, ip_address,
} = {}) => {
  const messages = await emailService.listEmails({ q, maxResults: max });
  const result = { imported: [], skipped: [], failed: [] };

  for (const message of messages) {
    const messageId = message.id;

    // Gate level email: pengirim harus user terdaftar + PM.
    let sender;
    try {
      const senderEmail = extractEmailAddress(message.from);
      if (!senderEmail) throw new Error('Alamat pengirim tidak valid');

      sender = await userRepository.findUserActiveWithEmailId(senderEmail);
      if (!sender) {
        result.skipped.push({ message_id: messageId, from: senderEmail, reason: 'Pengirim tidak terdaftar atau user tidak aktif' });
        continue;
      }
      if (!sender.roles.includes('PM')) {
        result.skipped.push({ message_id: messageId, from: senderEmail, reason: 'Pengirim terdaftar, tetapi tidak memiliki role PM' });
        continue;
      }
    } catch (err) {
      result.failed.push({ message_id: messageId, reason: err.message });
      continue;
    }

    const candidates = (message.attachments || [])
      .filter((attachment) => WO_FILENAME.test(attachment.filename || ''))
      .sort((a, b) => a.filename.localeCompare(b.filename));

    if (!candidates.length) {
      result.skipped.push({
        message_id: messageId,
        from: extractEmailAddress(message.from),
        reason: 'Tidak ada lampiran PDF/DOCX dengan nama WO + nomor',
      });
      continue;
    }

    // 1) Parse all kandidat dulu, dikelompokkan per nomor WO.
    const byWoNumber = new Map();
    for (const attachment of candidates) {
      try {
        const parsed = await parseAttachment(message, attachment);
        const reason = rejectionReason(
          attachment, parsed.fields, attachment.filename.match(WO_FILENAME)
        );

        if (reason) {
          result.skipped.push({ message_id: messageId, filename: attachment.filename, reason });
          continue;
        }

        const woNumber = String(parsed.fields.wo_number).replace(/\D/g, '');
        if (!byWoNumber.has(woNumber)) byWoNumber.set(woNumber, []);
        byWoNumber.get(woNumber).push({ attachment, parsed });
      } catch (err) {
        result.failed.push({ message_id: messageId, filename: attachment.filename, reason: err.message });
      }
    }

    // 2) Proses tiap nomor WO sendiri-sendiri.
    const woNumbers = [...byWoNumber.keys()].sort((a, b) => Number(a) - Number(b));

    for (const woNumber of woNumbers) {
      const files = byWoNumber.get(woNumber);
      const highest = Math.max(...files.map((f) => f.parsed.fields.revision));
      const winners = files.filter((f) => f.parsed.fields.revision === highest);

     const distinctHashes = new Set(winners.map((f) => f.parsed.hash));

      if (distinctHashes.size > 1) {
        // Revisi tertinggi sama, tetapi isi dokumen berbeda.
        winners.forEach((f) => result.skipped.push({
          message_id: messageId,
          filename: f.attachment.filename,
          wo_number: woNumber,
          revision: highest,
          ambiguous: true,
          reason: `Ada beberapa file berbeda pada revisi tertinggi ${highest}`,
        }));
        continue;
      }
      const winner = winners[0];
      //lampiran totally same
      for (const duplicate of winners.slice(1)) {
        result.skipped.push({
          message_id: messageId,
          filename: duplicate.attachment.filename,
          wo_number: woNumber,
          revision: highest,
          reason: 'Lampiran identik dengan file lain; duplikat dilewati',
        });
      }

      const { attachment, parsed } = winners[0];
      const payload = uploadService.toCreatePayload(parsed.fields);

      // 3) Satu WO: create atau revise sesuai data yang tersimpan.
      try {
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
          const duplicate = err.statusCode === 409 && err.data?.code === 'WO_DUPLICATE';

          if (!duplicate) throw err;

          const oldRevision = Number(err.data.existing_revision);
          if (!Number.isInteger(payload.revision) || payload.revision <= oldRevision) {
            result.skipped.push({
              message_id: messageId,
              filename: attachment.filename,
              wo_number: payload.wo_number,
              revision: payload.revision,
              reason: `WO sudah ada pada revisi ${oldRevision}; revisi masuk harus lebih baru`,
            });
            continue; // lanjut ke WO berikutnya
          }

          wo = await workOrderService.createWorkOrder({
            ...payload,
            overwrite: true,
            created_by: sender.id,
            roles: sender.roles,
            ip_address,
          });
          action = 'revised';
        }

        // 4) Analyze terpisah: gagal analyze tidak menggagalkan import.
        try {
          const analysis = await workOrderService.analyzeWorkOrder(wo.id, {
            user_id: sender.id,
            roles: sender.roles,
            ip_address,
          });

          result.imported.push({
            message_id: messageId,
            filename: attachment.filename,
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
            filename: attachment.filename,
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
        // Gagal create/revise WO ini saja; WO lain di email yang sama tetap diproses.
        result.failed.push({
          message_id: messageId,
          filename: attachment.filename,
          wo_number: payload.wo_number,
          revision: payload.revision,
          reason: err.message,
        });
      }
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

module.exports = { importFromGmail };