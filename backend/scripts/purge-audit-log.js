// Retention purge for audit_trail: deletes rows older than the retention window.
// Usage: node scripts/purge-audit-log.js [--dry-run] [--months N]
//        DRY_RUN=1 / RETENTION_MONTHS=N env vars also honored.
const pool = require('../src/config/db');

const args = process.argv.slice(2);
const monthsArg = args.find((a) => a.startsWith('--months='));
const RETENTION_MONTHS = monthsArg
  ? Number(monthsArg.split('=')[1])
  : Number(process.env.RETENTION_MONTHS || 6);
const DRY_RUN = args.includes('--dry-run') || process.env.DRY_RUN === '1';

if (!Number.isInteger(RETENTION_MONTHS) || RETENTION_MONTHS < 1) {
  console.error(`Invalid retention months: ${RETENTION_MONTHS}`);
  process.exit(2);
}

(async () => {
  const stats = await pool.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE created_at < NOW() - make_interval(months => $1))::int AS expiring
     FROM audit_trail`,
    [RETENTION_MONTHS]
  );
  const { total, expiring } = stats.rows[0];
  console.log(`Retention: ${RETENTION_MONTHS} months — ${total} rows total, ${expiring} older than cutoff`);

  if (DRY_RUN) {
    console.log('[dry-run] no rows deleted.');
    await pool.end();
    return;
  }

  // Single DELETE is fine at this scale; very large tables should run this repeatedly
  // or partition by created_at before purging.
  const deleted = await pool.query(
    'DELETE FROM audit_trail WHERE created_at < NOW() - make_interval(months => $1)',
    [RETENTION_MONTHS]
  );
  const remaining = await pool.query(
    'SELECT count(*)::int AS c, min(created_at)::text AS oldest FROM audit_trail'
  );
  console.log(`Deleted ${deleted.rowCount} rows. Remaining ${remaining.rows[0].c} (oldest ${remaining.rows[0].oldest}).`);
  await pool.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});