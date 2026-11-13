const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { ApiError } = require('../middleware/errorHandler');

const SCOPES = (process.env.GMAIL_OAUTH_SCOPES || 'https://www.googleapis.com/auth/gmail.readonly')
  .split(/\s+/).filter(Boolean);

const isConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const newAuth = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const getAuthUrl = () => {
  if (!isConfigured()) throw new ApiError(503, 'Google OAuth is not configured');
  return newAuth().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces refresh_token even on re-consent
    scope: SCOPES,
    state: jwt.sign({ purpose: 'gmail-oauth' }, process.env.JWT_SECRET, { expiresIn: '10m' }),
  });
};

const saveRefreshToken = (token) => {
  // shortcut: rewrites backend/.env in place; on a read-only/container .env paste GMAIL_REFRESH_TOKEN by hand
  const envPath = path.join(__dirname, '../../.env');
  const line = `GMAIL_REFRESH_TOKEN=${token}`;
  const body = fs.readFileSync(envPath, 'utf8');
  fs.writeFileSync(envPath, /^GMAIL_REFRESH_TOKEN=.*$/m.test(body)
    ? body.replace(/^GMAIL_REFRESH_TOKEN=.*$/m, line)
    : `${body.trimEnd()}\n${line}\n`);
  process.env.GMAIL_REFRESH_TOKEN = token; // no restart needed
};

const handleCallback = async (code, state) => {
  try {
    if (jwt.verify(state, process.env.JWT_SECRET).purpose !== 'gmail-oauth') throw new Error();
  } catch {
    throw new ApiError(400, 'Invalid OAuth state');
  }
  const { tokens } = await newAuth().getToken(code);
  if (!tokens.refresh_token) throw new ApiError(400, 'No refresh token returned — remove app access at myaccount.google.com/permissions and retry');
  saveRefreshToken(tokens.refresh_token);
};

const client = () => {
  if (!isConfigured() || !process.env.GMAIL_REFRESH_TOKEN) throw new ApiError(503, 'Gmail is not connected');
  const auth = newAuth();
  auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth });
};

const decode = (data) => Buffer.from(data, 'base64url').toString('utf8');

const collectBody = (part, out = {}) => {
  if (!part) return out;
  if (part.body && part.body.data) {
    const text = decode(part.body.data);
    if (part.mimeType === 'text/plain') out.text = out.text || text;
    if (part.mimeType === 'text/html') out.html = out.html || text;
  }
  (part.parts || []).forEach((p) => collectBody(p, out));
  return out;
};

const headersOf = (message) =>
  Object.fromEntries((message.payload.headers || []).map((h) => [h.name.toLowerCase(), h.value]));

//gate ambil 5 terbaru
const listEmails = async ({ q = '', maxResults = 5 } = {}) => {
  const gmail = client();
  const { data } = await gmail.users.messages.list({
    userId: 'me',
    q,
    maxResults: Math.min(Number(maxResults) || 5, 10),
  });
  const ids = (data.messages || []).map((m) => m.id);
  return Promise.all(ids.map((id) => getEmail(id)));
};

const getEmail = async (id) => {
  const gmail = client();
  const { data } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
  const h = headersOf(data);
  return {
    id: data.id,
    threadId: data.threadId,
    from: h.from,
    to: h.to,
    subject: h.subject,
    date: h.date,
    snippet: data.snippet,
    body: collectBody(data.payload),
    attachments: attachmentsOf(data.payload)
  };
};
const attachmentsOf = (part, out = []) => {
  if (!part) return out;
  if (part.body && part.body.attachmentId) {
    out.push({ filename: part.filename, mimeType: part.mimeType, size: part.body.size, attachmentId: part.body.attachmentId });
  }
  (part.parts || []).forEach((p) => attachmentsOf(p, out));
  return out;
};


const getAttachment = async (messageId, attachmentId) => {
  const { data } = await client().users.messages.attachments.get({ userId: 'me', messageId, id: attachmentId });
  return Buffer.from(data.data, 'base64url');
};

module.exports = { getAuthUrl, handleCallback, listEmails, getEmail, isConfigured, attachmentsOf, getAttachment };