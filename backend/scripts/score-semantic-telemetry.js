const { Pool } = require('pg');
require('dotenv').config();
const telemetry = require('../src/services/classifyTelemetry');

const MIN_DECISIONS = Number(process.env.TELEMETRY_MIN_DECISIONS) || 20;
const MAX_WRONG_RATE = Number(process.env.TELEMETRY_MAX_WRONG_RATE) || 0.05;

(async () => {
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT, 10) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });
  const res = await pool.query(
    `SELECT id, action, entity_id, details FROM audit_trail
     WHERE action IN ($1, $2) ORDER BY id`,
    [telemetry.DECIDED_ACTION, telemetry.REVIEWED_ACTION]);
  await pool.end();
  const byItem = new Map();
  for (const row of res.rows) {
    let details = null;
    try {
      details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details;
    } catch {
      details = null;
    }
    if (!details) continue;
    if (!byItem.has(row.entity_id)) byItem.set(row.entity_id, { decided: [], reviewed: [] });
    const slot = byItem.get(row.entity_id);
    if (row.action === telemetry.DECIDED_ACTION) slot.decided.push({ auditId: row.id, ...details });
    else slot.reviewed.push({ auditId: row.id, ...details });
  }
  const totals = {
    decided: 0, lexical: 0, blocked: 0, auto: 0,
    confirmed: 0, overridden: 0, noSuggestion: 0, pending: 0,
    suggestConfirmed: 0, suggestOverridden: 0,
    blocks: {},
  };
  for (const { decided, reviewed } of byItem.values()) {
    for (const d of decided) {
      totals.decided++;
      if (d.path === 'lexical') {
        totals.lexical++;
        continue;
      }
      if (d.path !== 'semantic') {
        totals.blocked++;
        const reason = d.block_reason || 'UNKNOWN';
        totals.blocks[reason] = (totals.blocks[reason] || 0) + 1;
        const pair = reviewed.find((r) => r.auditId > d.auditId);
        if (pair) {
          const outcome = telemetry.scoreOutcome({
            suggestionComplexityId: d.suggested_complexity_id,
            suggestionFw: d.suggested_fw,
            finalComplexityId: pair.final_complexity_id,
            finalFw: pair.final_fw,
          });
          if (outcome === 'CONFIRMED') totals.suggestConfirmed++;
          else if (outcome === 'OVERRIDDEN') totals.suggestOverridden++;
        }
        continue;
      }
      totals.auto++;
      const pair = reviewed.find((r) => r.auditId > d.auditId);
      if (!pair) {
        totals.pending++;
        continue;
      }
      const outcome = telemetry.scoreOutcome({
        suggestionComplexityId: d.suggested_complexity_id,
        suggestionFw: d.suggested_fw,
        finalComplexityId: pair.final_complexity_id,
        finalFw: pair.final_fw,
      });
      if (outcome === 'CONFIRMED') totals.confirmed++;
      else if (outcome === 'OVERRIDDEN') totals.overridden++;
      else totals.noSuggestion++;
    }
  }
  const judged = totals.confirmed + totals.overridden;
  const wrongRate = judged === 0 ? 0 : totals.overridden / judged;
  console.log(`decided events: ${totals.decided} (lexical=${totals.lexical} blocked=${totals.blocked} auto=${totals.auto})`);
  console.log(`auto-decisions: confirmed=${totals.confirmed} overridden=${totals.overridden} ` +
    `no-suggestion=${totals.noSuggestion} pending=${totals.pending}`);
  console.log(`wrong rate: ${(wrongRate * 100).toFixed(1)}% (${totals.overridden}/${judged})`);
  console.log(`suggestions on review path: confirmed=${totals.suggestConfirmed} overridden=${totals.suggestOverridden}`);
  console.log(`block reasons: ${JSON.stringify(totals.blocks)}`);
  if (judged >= MIN_DECISIONS && wrongRate > MAX_WRONG_RATE) {
    console.log(`THRESHOLD FAIL: wrong rate exceeds ${MAX_WRONG_RATE} over ${judged} judged decisions ` +
      `-> consider SEMANTIC_ENABLED=0`);
    process.exit(1);
  }
  console.log(`THRESHOLD PASS (min decisions=${MIN_DECISIONS}, max wrong rate=${MAX_WRONG_RATE})`);
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
