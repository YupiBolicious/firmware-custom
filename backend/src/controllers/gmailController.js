const gmailService = require('../services/gmailService');
const emailImportService = require('../services/emailImportService');

const start = (req, res) => res.redirect(gmailService.getAuthUrl());

const callback = async (req, res, next) => {
  try {
    await gmailService.handleCallback(req.query.code, req.query.state);
    res.send('<p>Gmail connected. You can close this tab.</p>');
  } catch (err) { next(err); }
};

const list = async (req, res, next) => {
  try {
    const data = await gmailService.listEmails({ q: req.query.q, maxResults: req.query.max });
    res.json({ success: true, message: 'Emails retrieved', data });
  } catch (err) { next(err); }
};

const get = async (req, res, next) => {
  try {
    const data = await gmailService.getEmail(req.params.id);
    res.json({ success: true, message: 'Email retrieved', data });
  } catch (err) { next(err); }
};

const importEmails = async (req, res, next) => {
  try {
    const data = await emailImportService.importFromGmail({
      max: req.body?.max || 20,
      user: req.user,
      ip_address: req.ip,
    });

    res.json({
      success: true,
      message: 'Gmail import completed',
      data,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { start, callback, list, get, importEmails };