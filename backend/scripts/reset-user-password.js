const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

const readArg = (name) => {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : '';
};

(async () => {
  const identifier = String(readArg('identifier')).trim().toLowerCase();
  const password = String(readArg('password'));

  if (!identifier || !password) {
    console.error('Usage: node scripts/reset-user-password.js --identifier <username|email> --password <new password>');
    process.exitCode = 1;
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exitCode = 1;
    return;
  }

  const { rows } = await pool.query(
    'SELECT id, username, email FROM users WHERE username = $1 OR email = $1',
    [identifier]
  );
  if (rows.length === 0) {
    console.error(`No user with username or email "${identifier}".`);
    process.exitCode = 1;
    return;
  }
  if (rows.length > 1) {
    console.error(`"${identifier}" matches ${rows.length} users; use an exact username.`);
    process.exitCode = 1;
    return;
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await pool.query('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1', [rows[0].id, hash]);

  console.log(`Password updated for ${rows[0].username} <${rows[0].email}> (id ${rows[0].id}).`);
  console.log('Login lockout counters live in the API process memory: restart the API if the account is also locked out.');
})().catch((err) => {
  console.error('FATAL:', err.message);
  process.exitCode = 1;
}).finally(() => pool.end());
