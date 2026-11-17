const subject = ({ wo_number }) => `Work Order [${wo_number}] Estimation.`;

const firmwareItems = (items = []) => items.filter(
  (item) => item.fw_related && item.complexity_level_id && item.complexity_code !== 'L0'
);

const line = (item, index) => {
  const level = item.complexity_code || '';
  const firmware = item.firmware_name || 'N/A';
  return `${index + 1}. ${item.title} → ${level} (${firmware})`;
};

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);

const body = ({ wo_number, action_url, items = [] }) => {
  const firmware = firmwareItems(items);
  const details = firmware.length === 0
    ? 'No firmware items were identified.'
    : `Firmware items:\n${firmware.map(line).join('\n')}`;
  const buttonLabel = firmware.length === 0 ? 'Complete Work Order' : 'Request Work Order';
  return `Hello,\n\nYour request - Work Order ${wo_number} - has been classified and is ready to proceed.\n\n${details}\n\n${buttonLabel}:\n${action_url}\n\nRegards,\nFirmware Team\n`;
};

const htmlBody = ({ wo_number, action_url, items = [] }) => {
  const firmware = firmwareItems(items);
  const details = firmware.length === 0
    ? '<p>No firmware items were identified.</p>'
    : `<p>Firmware items:</p><ol>${firmware.map((item) => (
      `<li>${escapeHtml(item.title)} → ${escapeHtml(item.complexity_code || '')} (${escapeHtml(item.firmware_name || 'N/A')})</li>`
    )).join('')}</ol>`;
  const buttonLabel = firmware.length === 0 ? 'Complete Work Order' : 'Request Work Order';

  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">
  <p>Hello,</p>
  <p>Your request - Work Order <strong>${escapeHtml(wo_number)}</strong> - has been classified and is ready to proceed.</p>
  ${details}
  <p style="margin:24px 0">
    <a href="${escapeHtml(action_url)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600">${buttonLabel}</a>
  </p>
  <p>Regards,<br>Firmware Team</p>
</body></html>`;
};

module.exports = { subject, body, htmlBody };
