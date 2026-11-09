const nodemailer = require('nodemailer');

let transporter = null;

const isConfigured = () => Boolean(process.env.SMTP_HOST);

const getTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: /^(1|true|yes)$/i.test(String(process.env.SMTP_SECURE || '')),
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  return transporter;
};

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const sendAccountCreated = async ({ to, username, roles, initialPassword }) => {
  if (!isConfigured()) {
    return { sent: false, error: 'Email is not configured (SMTP_HOST is missing)' };
  }

  const loginUrl = process.env.APP_LOGIN_URL || 'http://localhost:5173/login';
  const from = process.env.SMTP_FROM || 'no-reply@localhost';
  const roleText = Array.isArray(roles) ? roles.join(', ') : String(roles || '');
  const appName = 'Firmware Custom';

  const lines = [
    `Hello ${username},`,
    '',
    `An account has been created for you on ${appName}.`,
    '',
    `Username: ${username}`,
    `Email: ${to}`,
    `Role: ${roleText}`,
    `Login: ${loginUrl}`,
    `Initial password: ${initialPassword}`,
    '',
    'Sign in and change your password right away. If you were not expecting this email, contact your administrator.',
  ];

  const html = `<p>Hello ${escapeHtml(username)},</p>
<p>An account has been created for you on ${appName}.</p>
<ul>
  <li><strong>Username:</strong> ${escapeHtml(username)}</li>
  <li><strong>Email:</strong> ${escapeHtml(to)}</li>
  <li><strong>Role:</strong> ${escapeHtml(roleText)}</li>
  <li><strong>Login:</strong> <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></li>
  <li><strong>Initial password:</strong> ${escapeHtml(initialPassword)}</li>
</ul>
<p>Sign in and change your password right away. If you were not expecting this email, contact your administrator.</p>`;

  try {
    await getTransporter().sendMail({
      from,
      to,
      subject: `Your ${appName} account has been created`,
      text: lines.join('\n'),
      html,
    });
    return { sent: true, error: null };
  } catch (err) {
    console.error(`Account email to ${to} failed: ${err.message}`);
    return { sent: false, error: 'Could not deliver the account email' };
  }
};

const sendPasswordReset = async ({to, username, resetUrl, expiresMin}) => {
  if(!isConfigured()) {
    return{sent:false, error: `Email is not configured`};
  }

  const from = process.env.SMTP_FROM;
  const appName = 'Firmware Custom';
  
  const lines = [ `Hello ${username},`,
    '',
    `A password reset was requested for your ${appName}: ${username} account.`,
    '',
    `Password reset URL: ${resetUrl}`,
    '',
    `This reset link will expire in ${expiresMin} minutes and can be used only once.`,
    'If you did not request this action, please ignore this email.'
  ];

  const html = `<p>Hello ${escapeHtml(username)}, </p>
  <p>A password reset was requested for your ${appName}: ${escapeHtml(username)} account.</p>
  <p>Password reset URL: <a href= "${escapeHtml(resetUrl)}"> to reset your password</a></p>
  <p>This reset link will expire in ${escapeHtml(expiresMin)} minutes and can be used only once. If you did not request for this action, please ignore this email.
  </p>`;
  try {
    await getTransporter().sendMail({
      from, to, subject:`Password reset for: ${appName}`, text: lines.join('\n'), html
    });
    return{sent: true, error: null};
  } catch {err} {
    console.error(`Password reset email to ${to} failed: ${err.message}`);
    return { sent: false, error: 'Could not deliver the account email' };
  }
};

module.exports = { sendAccountCreated, isConfigured, sendPasswordReset };
