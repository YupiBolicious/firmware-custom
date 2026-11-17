const workOrderRepository = require('../repositories/workOrderRepository');
const template = require('../templates/classificationReady');
const emailService = require('./emailService');
const emailActionService = require('./emailActionService');

const sendClassificationComplete = async (workOrderId) => {
  console.log('[classification email] start', { workOrderId });
  console.log('[classification email] config', {
    hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    hasRefreshToken: Boolean(process.env.GMAIL_REFRESH_TOKEN),
    hasSendScope: String(process.env.GMAIL_OAUTH_SCOPES || '')
      .split(/\s+/)
      .includes('https://www.googleapis.com/auth/gmail.send'),
  });

  if (typeof emailService.sendMail !== 'function') {
    console.warn('[classification email] skipped: sendMail is unavailable');
    return;
  }

  if (!emailService.isConfigured?.()) {
    console.warn('[classification email] skipped: OAuth client is not configured');
    return;
  }

  try {
    const { workOrder, items } =
      await workOrderRepository.findClassificationEmailDataByWorkOrderId(workOrderId);

    if (!workOrder) {
      console.warn('[classification email] skipped: work order not found');
      return;
    }

    if (!workOrder.created_by_email) {
      console.warn('[classification email] skipped: creator email is empty', {
        workOrderId,
        createdBy: workOrder.created_by,
      });
      return;
    }

    const actionUrl = await emailActionService.createRequestWorkOrderUrl({
      work_order_id: workOrder.id,
      user_id: workOrder.created_by,
    });
    if (!actionUrl) {
      console.warn('[classification email] skipped: work order is not analyzed or creator is not the owner', {
        workOrderId,
      });
      return;
    }

    console.log('[classification email] sending', {
      workOrderId,
      woNumber: workOrder.wo_number,
      recipient: workOrder.created_by_email,
      itemCount: items.length,
    });

    const templateData = {
      wo_number: workOrder.wo_number,
      work_order_id: workOrder.id,
      action_url: actionUrl,
      items,
    };

    const sent = await emailService.sendMail({
      to: workOrder.created_by_email,
      subject: template.subject(workOrder),
      text: template.body(templateData),
      html: template.htmlBody(templateData),
    });

    console.log('[classification email] Gmail accepted message', {
      workOrderId,
      gmailMessageId: sent?.id || null,
    });
  } catch (err) {
    console.error('[classification email] failed', {
      workOrderId,
      message: err.message,
      code: err.code,
      status: err.response?.status,
      errors: err.errors,
    });
  }
};

module.exports = {sendClassificationComplete};