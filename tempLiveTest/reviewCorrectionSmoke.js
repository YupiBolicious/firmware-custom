// Self-cleaning live smoke test for correcting a coder's completed level decision.
const base = 'http://localhost:5000';
const pool = require('C:/Program Files/Firmware Custom/backend/src/config/db');
const PREFIX = 'RCORR-';
const EMAILS = { pm: 'pm@demo.com', coder: 'coder@demo.com', admin: 'admin@demo.com' };
const PASSWORD = 'password123';

async function api(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await response.json(); } catch {}
  return { status: response.status, data: json && json.data, json };
}
const query = (sql, params) => pool.query(sql, params);
async function login(identifier) {
  const response = await api('POST', '/api/auth/login', null, { identifier, password: PASSWORD });
  if (!response.data?.token) throw new Error(`login failed for ${identifier}: ${response.status}`);
  return response.data.token;
}

let pass = 0;
let fail = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log('PASS ' + name);
  } else {
    fail++;
    failures.push(name);
    console.log(`FAIL ${name} ${detail}`);
  }
}

async function cleanupWorkOrder(id) {
  if (!id) return;
  const itemIds = (await query('SELECT id FROM work_order_items WHERE work_order_id=$1', [id])).rows.map((row) => row.id);
  await query('DELETE FROM audit_trail WHERE work_order_id=$1 OR (entity_type=\'WORK_ORDER\' AND entity_id=$1)', [id]);
  await query('DELETE FROM notifications WHERE entity_id=$1', [id]);
  await query('DELETE FROM production_tasks WHERE work_order_id=$1', [id]);
  if (itemIds.length) {
    await query(
      `DELETE FROM classification_matches WHERE classification_id IN
       (SELECT id FROM classifications WHERE work_order_item_id = ANY($1))`, [itemIds]
    );
    await query('DELETE FROM classifications WHERE work_order_item_id = ANY($1)', [itemIds]);
    await query('DELETE FROM item_estimations WHERE work_order_item_id = ANY($1)', [itemIds]);
    await query('DELETE FROM work_order_items WHERE id = ANY($1)', [itemIds]);
    await query('DELETE FROM kb_items WHERE kb_code = ANY($1)', [itemIds.map((itemId) => `KB-CODER-${itemId}`)]);
    await query('UPDATE kb_corpus_version SET version=version+1, updated_at=NOW() WHERE id=1');
  }
  await query('DELETE FROM work_order_access WHERE work_order_id=$1', [id]);
  await query('DELETE FROM work_order_groups WHERE work_order_id=$1', [id]);
  await query('DELETE FROM work_orders WHERE id=$1', [id]);
}

(async () => {
  const ts = Date.now();
  let workOrderId = null;
  try {
    const leftovers = (await query('SELECT id FROM work_orders WHERE wo_number LIKE $1', [`${PREFIX}%`])).rows;
    for (const row of leftovers) await cleanupWorkOrder(row.id);

    const [pm, coder, admin] = await Promise.all([login(EMAILS.pm), login(EMAILS.coder), login(EMAILS.admin)]);
    const levels = (await query(
      `SELECT id, code FROM complexity_levels WHERE is_active=TRUE AND code IN ('L0','L2','L3','L5')`
    )).rows;
    const levelId = Object.fromEntries(levels.map((level) => [level.code, level.id]));
    if (Object.keys(levelId).length !== 4) throw new Error('Expected active L0, L2, L3 and L5 levels');

    const model = (await query('SELECT id FROM machine_model ORDER BY id LIMIT 1')).rows[0];
    if (!model) throw new Error('No machine model available for scratch work order');

    let response = await api('POST', '/api/work-orders', pm, {
      wo_number: `${PREFIX}${ts}`,
      title: 'Review correction smoke',
      customer: 'QA',
      groups: [{ machine_model_id: model.id, serial_number: `rc-${ts}` }],
    });
    check('create scratch work order', response.status === 201, `status=${response.status}`);
    if (!response.data?.id) throw new Error('Scratch work order creation failed');
    workOrderId = response.data.id;
    const groupId = response.data.groups[0].id;

    response = await api('POST', `/api/work-orders/${workOrderId}/items`, pm, {
      work_order_group_id: groupId,
      title: `Unique firmware correction probe ${ts}`,
      quantity: 1,
    });
    check('create item', response.status === 201, `status=${response.status}`);
    const itemId = response.data?.id;
    if (!itemId) throw new Error('Scratch item creation failed');

    response = await api('POST', `/api/work-orders/${workOrderId}/analyze`, pm);
    check('analyze work order', response.status === 200, `status=${response.status}`);
    await query(
      `UPDATE classifications SET fw_related=NULL, complexity_level_id=NULL, status='CODER_REVIEW',
         reviewed_by=NULL, reviewed_at=NULL WHERE work_order_item_id=$1`,
      [itemId]
    );

    response = await api('POST', `/api/work-orders/items/${itemId}/review`, coder, {
      complexity_level_id: levelId.L5,
      notes: 'initial L5 decision',
    });
    check('confirm initial L5 review', response.status === 200, `status=${response.status}`);

    response = await api('PUT', `/api/work-orders/items/${itemId}/review-correction`, pm, {
      complexity_level_id: levelId.L3,
    });
    check('non-coder cannot use correction endpoint', response.status === 403, `status=${response.status}`);
    response = await api('PUT', `/api/work-orders/items/${itemId}/review-correction`, admin, {
      complexity_level_id: levelId.L3,
    });
    check('different reviewer cannot correct the decision', response.status === 403, `status=${response.status}`);

    response = await api('PUT', `/api/work-orders/items/${itemId}/review-correction`, coder, {
      complexity_level_id: levelId.L3,
      reason: 'Corrected after checking the requirements',
    });
    check('correct L5 to L3', response.status === 200 && response.data?.complexity_code === 'L3', `status=${response.status}`);
    const corrected = (await query(
      `SELECT c.status, c.fw_related, cl.code AS complexity_code, ie.complexity_level_id AS estimate_level,
              ie.total_hours, kb.complexity_level_id AS learned_level
       FROM classifications c
       JOIN complexity_levels cl ON cl.id=c.complexity_level_id
       JOIN item_estimations ie ON ie.work_order_item_id=c.work_order_item_id
       JOIN kb_items kb ON kb.kb_code=$2
       WHERE c.work_order_item_id=$1`,
      [itemId, `KB-CODER-${itemId}`]
    )).rows[0];
    check('classification, estimate and learned KB all now L3', !!corrected
      && corrected.status === 'CLASSIFIED' && corrected.fw_related === true
      && corrected.complexity_code === 'L3'
      && Number(corrected.estimate_level) === Number(levelId.L3)
      && Number(corrected.learned_level) === Number(levelId.L3), JSON.stringify(corrected));

    response = await api('PUT', `/api/work-orders/items/${itemId}/review-correction`, coder, {
      complexity_level_id: levelId.L3,
    });
    check('same-level correction rejected', response.status === 400, `status=${response.status}`);

    response = await api('POST', `/api/work-orders/${workOrderId}/finalize`, pm);
    check('finalize corrected work order', response.status === 200, `status=${response.status}`);
    check('firmware item has a production task', (await query(
      'SELECT COUNT(*)::int AS count FROM production_tasks WHERE work_order_item_id=$1', [itemId]
    )).rows[0].count === 1);

    response = await api('PUT', `/api/work-orders/items/${itemId}/review-correction`, coder, {
      complexity_level_id: levelId.L0,
    });
    check('finalized correction to L0 succeeds', response.status === 200 && response.data?.classification_status === 'NON_FIRMWARE', `status=${response.status}`);
    check('L0 correction removes finalized production task', (await query(
      'SELECT COUNT(*)::int AS count FROM production_tasks WHERE work_order_item_id=$1', [itemId]
    )).rows[0].count === 0);

    response = await api('PUT', `/api/work-orders/items/${itemId}/review-correction`, coder, {
      complexity_level_id: levelId.L2,
    });
    check('finalized correction back to L2 succeeds', response.status === 200 && response.data?.classification_status === 'CLASSIFIED', `status=${response.status}`);
    check('L2 correction recreates finalized production task', (await query(
      'SELECT COUNT(*)::int AS count FROM production_tasks WHERE work_order_item_id=$1', [itemId]
    )).rows[0].count === 1);

    response = await api('POST', `/api/work-orders/${workOrderId}/production`, coder);
    check('start production', response.status === 200, `status=${response.status}`);
    response = await api('PUT', `/api/work-orders/items/${itemId}/review-correction`, coder, {
      complexity_level_id: levelId.L3,
    });
    check('correction rejected after production starts', response.status === 409, `status=${response.status}`);

    const audit = (await query(
      `SELECT details FROM audit_trail
       WHERE action='ITEM_CLASSIFICATION_CORRECTED' AND entity_type='WORK_ORDER_ITEM' AND entity_id=$1
       ORDER BY id`, [itemId]
    )).rows;
    check('three corrections recorded in audit', audit.length === 3);
    check('audit captures old/new values and reason', audit[0]?.details?.previous?.complexity_code === 'L5'
      && audit[0]?.details?.corrected?.complexity_code === 'L3'
      && audit[0]?.details?.reason === 'Corrected after checking the requirements');
  } finally {
    if (workOrderId) await cleanupWorkOrder(workOrderId);
    await pool.end();
  }

  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  if (failures.length) console.log('Failed checks:', failures.join(', '));
  process.exitCode = fail ? 1 : 0;
})().catch(async (err) => {
  console.error('SMOKE ERROR:', err.message);
  try { if (pool) await pool.end(); } catch {}
  process.exitCode = 1;
});
