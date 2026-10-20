// Re-runnable PM dashboard attention smoke. Requires backend + database on localhost.
// Creates only scratch work orders and removes them (plus related audit/notification rows).
const fs = require('fs');
const path = require('path');
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');

const base = 'http://localhost:5000';
const prefix = `ATN-${Date.now()}`;
const resultsPath = path.join(__dirname, '_pm-attention-results.json');
const scratchIds = [];
let pass = 0;
let fail = 0;
const failures = [];

async function api(method, route, token, body) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await response.json(); } catch (_) {}
  return { status: response.status, data: json?.data, json };
}

function check(label, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`PASS ${label}`);
  } else {
    fail++;
    failures.push(`${label}${detail ? ` [${detail}]` : ''}`);
    console.error(`FAIL ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function createWo(token, modelId, tag, titles) {
  const woNumber = `${prefix}-${tag}`;
  const created = await api('POST', '/api/work-orders', token, {
    wo_number: woNumber,
    title: `${prefix} ${tag}`,
    customer: 'Attention smoke',
    groups: [{ machine_model_id: modelId, serial_number: `${prefix}-${tag}` }],
  });
  if (created.status !== 201 || !created.data?.id) {
    throw new Error(`create WO ${tag} failed: ${created.status} ${JSON.stringify(created.json)}`);
  }
  const workOrderId = created.data.id;
  scratchIds.push(workOrderId);
  const itemIds = [];
  for (const title of titles) {
    const item = await api('POST', `/api/work-orders/${workOrderId}/items`, token, {
      title,
      quantity: 1,
    });
    if (item.status !== 201 || !item.data?.id) {
      throw new Error(`create item in ${tag} failed: ${item.status} ${JSON.stringify(item.json)}`);
    }
    itemIds.push(item.data.id);
  }
  return { workOrderId, itemIds };
}

async function setClassification(itemId, status, fwRelated = null, createdAt = null) {
  await pool.query(
    `INSERT INTO classifications (work_order_item_id, status, fw_related, created_at, updated_at)
     VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()), COALESCE($4::timestamptz, NOW()))
     ON CONFLICT (work_order_item_id) DO UPDATE
       SET status = EXCLUDED.status, fw_related = EXCLUDED.fw_related,
           reviewed_by = NULL, reviewed_at = NULL,
           created_at = EXCLUDED.created_at, updated_at = EXCLUDED.updated_at`,
    [itemId, status, fwRelated, createdAt]
  );
}

(async () => {
  try {
    const login = await api('POST', '/api/auth/login', undefined, {
      identifier: 'pm@demo.com', password: 'password123',
    });
    const token = login.data?.token;
    if (!token) throw new Error(`PM login failed: ${login.status}`);
    const model = (await pool.query('SELECT id FROM machine_model ORDER BY id LIMIT 1')).rows[0];
    if (!model) throw new Error('No machine model seed exists');

    // DRAFT with items -> analysis action (missing classifications count as items).
    const draft = await createWo(token, model.id, 'DRAFT', ['Draft work item']);

    // Two review items at different ages verify one alert per WO, oldest age, and aggregation.
    const review = await createWo(token, model.id, 'REVIEW', ['Review old item', 'Review newer item']);
    await setClassification(review.itemIds[0], 'CODER_REVIEW', null, new Date(Date.now() - 50 * 3600000));
    await setClassification(review.itemIds[1], 'CODER_REVIEW', null, new Date(Date.now() - 30 * 3600000));
    await pool.query("UPDATE work_orders SET status='ANALYZED' WHERE id=$1", [review.workOrderId]);

    const midReview = await createWo(token, model.id, 'REVIEW-MID', ['Review 30 hour item']);
    await setClassification(midReview.itemIds[0], 'CODER_REVIEW', null, new Date(Date.now() - 30 * 3600000));
    await pool.query("UPDATE work_orders SET status='ANALYZED' WHERE id=$1", [midReview.workOrderId]);

    const freshReview = await createWo(token, model.id, 'REVIEW-FRESH', ['Review 12 hour item']);
    await setClassification(freshReview.itemIds[0], 'CODER_REVIEW', null, new Date(Date.now() - 12 * 3600000));
    await pool.query("UPDATE work_orders SET status='ANALYZED' WHERE id=$1", [freshReview.workOrderId]);

    // ANALYZED + PENDING classification -> unresolved item action.
    const pending = await createWo(token, model.id, 'PENDING', ['Pending classification']);
    await setClassification(pending.itemIds[0], 'PENDING');
    await pool.query("UPDATE work_orders SET status='ANALYZED' WHERE id=$1", [pending.workOrderId]);

    // ANALYZED + resolved verdict -> ready-to-finalize action.
    const ready = await createWo(token, model.id, 'READY', ['Ready classification']);
    await setClassification(ready.itemIds[0], 'CLASSIFIED', true);
    await pool.query("UPDATE work_orders SET status='ANALYZED' WHERE id=$1", [ready.workOrderId]);

    // PRODUCTION + open task -> task follow-up, with multiple rows to test counts.
    const production = await createWo(token, model.id, 'PROD', ['Production item one', 'Production item two']);
    await setClassification(production.itemIds[0], 'CLASSIFIED', true);
    await setClassification(production.itemIds[1], 'CLASSIFIED', true);
    await pool.query("UPDATE work_orders SET status='PRODUCTION' WHERE id=$1", [production.workOrderId]);
    await pool.query(
      `INSERT INTO production_tasks (task_code, work_order_id, work_order_item_id, title, completed)
       VALUES ($1, $2, $3, 'Open production task 1', FALSE),
              ($4, $2, $5, 'Open production task 2', FALSE)`,
      [`${prefix}-PROD-1`, production.workOrderId, production.itemIds[0], `${prefix}-PROD-2`, production.itemIds[1]]
    );

    // Empty old DRAFT has no higher-priority action and should produce a stale alert.
    const stale = await createWo(token, model.id, 'STALE', []);
    await pool.query("UPDATE work_orders SET updated_at=NOW() - INTERVAL '10 days' WHERE id=$1", [stale.workOrderId]);

    const dashboard = await api('GET', `/api/pm-dashboard?search=${encodeURIComponent(prefix)}`, token);
    check('dashboard API success', dashboard.status === 200 && dashboard.data?.attention, `status=${dashboard.status}`);
    const alerts = dashboard.data?.attention || [];
    const byKind = (kind) => alerts.filter((alert) => alert.kind === kind);

    const reviewAlerts = byKind('coder_review');
    check('review alerts aggregate to one per WO', reviewAlerts.length === 3, `count=${reviewAlerts.length}`);
    const overdueReview = reviewAlerts.find((alert) => alert.work_order_id === review.workOrderId);
    check('review aggregation count and urgency', overdueReview?.affected_count === 2 && overdueReview?.priority === 'danger', JSON.stringify(overdueReview));
    check('review age uses oldest pending item', overdueReview?.age_hours >= 49 && overdueReview?.age_hours <= 51, `age=${overdueReview?.age_hours}`);
    check('review sample item included', !!overdueReview?.sample_item && !!overdueReview?.sample_title, JSON.stringify(overdueReview));
    check('review warning threshold at 24-48h', byKind('coder_review').some((alert) => alert.work_order_id === midReview.workOrderId && alert.priority === 'warning'));
    check('review info threshold below 24h', byKind('coder_review').some((alert) => alert.work_order_id === freshReview.workOrderId && alert.priority === 'info'));
    check('draft analysis action shown', byKind('analysis_needed').some((alert) => alert.work_order_id === draft.workOrderId && alert.affected_count === 1));
    check('pending classification action shown', byKind('classification_pending').some((alert) => alert.work_order_id === pending.workOrderId));
    check('ready-to-finalize action shown', byKind('ready_to_finalize').some((alert) => alert.work_order_id === ready.workOrderId));
    const productionAlerts = byKind('production_followup');
    check('open production tasks aggregated', productionAlerts.length === 1 && productionAlerts[0]?.affected_count === 2, JSON.stringify(productionAlerts));
    check('stale work order shown', byKind('stale').some((alert) => alert.work_order_id === stale.workOrderId));
    check('stale suppressed when action alert exists', !byKind('stale').some((alert) => alert.work_order_id === review.workOrderId || alert.work_order_id === production.workOrderId));
    check('overdue KPI counts pending-review work order', dashboard.data?.kpis?.overdue >= 1, `overdue=${dashboard.data?.kpis?.overdue}`);

    const filtered = await api('GET', `/api/pm-dashboard?search=${encodeURIComponent(prefix)}&status=ANALYZED`, token);
    check('status filter applies to attention', filtered.status === 200 && filtered.data.attention.every((alert) => (
      [review.workOrderId, midReview.workOrderId, freshReview.workOrderId, pending.workOrderId, ready.workOrderId].includes(alert.work_order_id)
    )), JSON.stringify(filtered.data?.attention?.map((alert) => [alert.work_order_id, alert.kind])));
  } catch (error) {
    fail++;
    failures.push(error.message);
    console.error(error);
  } finally {
    if (scratchIds.length) {
      await pool.query('DELETE FROM audit_trail WHERE work_order_id = ANY($1::int[])', [scratchIds]);
      await pool.query('DELETE FROM notifications WHERE entity_id = ANY($1::int[])', [scratchIds]);
      await pool.query('DELETE FROM work_orders WHERE id = ANY($1::int[])', [scratchIds]);
    }
    const residue = scratchIds.length
      ? Number((await pool.query('SELECT COUNT(*)::int AS count FROM work_orders WHERE id = ANY($1::int[])', [scratchIds])).rows[0].count)
      : 0;
    check('scratch work orders cleaned', residue === 0, `residue=${residue}`);
    const results = { prefix, pass, fail, failures, scratch_work_order_ids: scratchIds };
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`\n${pass} passed, ${fail} failed. Results: ${resultsPath}`);
    await pool.end();
    if (fail > 0) process.exitCode = 1;
  }
})();
