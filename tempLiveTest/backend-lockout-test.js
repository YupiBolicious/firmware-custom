// Login lockout live test (run against a throwaway backend instance, e.g. PORT=5001).
// Usage: node backend-lockout-test.js [base]
// Cleans up its own audit rows afterwards.
const BASE = process.argv[2] || 'http://localhost:5001/api';
const LOCK_TEST_ID = '__locktest@example.com';
const CODER_PW = 'CustomRequest123';
const CLEAN_IDENTIFIERS = [LOCK_TEST_ID, 'coder@demo.com'];

let pass = 0; let fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); };

const attempt = async (identifier, password) => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  return { status: res.status, body: await res.json() };
};

(async () => {
  const seq = [];
  for (let i = 1; i <= 5; i++) seq.push(await attempt(LOCK_TEST_ID, 'wrongpass'));
  check('attempts 1-4 are 401', seq.slice(0, 4).every((r) => r.status === 401));
  check('attempts 1-4 message', seq[0].body.message === 'invalid username or password. check your credentials and try again');
  check('attempt 5 is 429 (locked)', seq[4].status === 429);
  check('attempt 5 mentions admin reset', /admin/i.test(seq[4].body.message));
  check('attempt 5 retry_after > 0', seq[4].body.data && seq[4].body.data.retry_after > 0);

  const stillLocked = await attempt(LOCK_TEST_ID, 'anything');
  check('locked attempt stays 429', stillLocked.status === 429);

  for (let i = 0; i < 3; i++) await attempt('coder@demo.com', 'wrongpassword');
  const ok = await attempt('coder@demo.com', CODER_PW);
  check('correct login after 3 fails -> 200 (resets counter)', ok.status === 200);
  let resetOk = true;
  for (let i = 0; i < 4; i++) {
    const r = await attempt('coder@demo.com', 'wrongpassword');
    if (r.status !== 401) { resetOk = false; console.log('  unexpected status on post-reset attempt', i + 1, r.status); }
  }
  check('4 bad attempts post-reset still 401 (no premature lock)', resetOk);

  const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');
  const purge = await pool.query(
    `DELETE FROM audit_trail
     WHERE details->>'identifier' = ANY($1)
       AND action IN ('LOGIN_FAILED','LOGIN_LOCKED')
       AND created_at > NOW() - INTERVAL '30 minutes'`,
    [CLEAN_IDENTIFIERS]
  );
  await pool.end();
  console.log(`cleaned ${purge.rowCount} scratch audit row(s)`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();