const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT, 10) || 5432,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});
(async () => {
  const r = await pool.query(
    `SELECT woi.item_number, woi.title, woi.quantity, cl.code AS cx,
            ie.requirement_review_h, ie.code_development_h, ie.peer_review_fixing_h,
            ie.bench_testing_h, ie.unit_testing_h,
            ie.verification_mh, ie.documentation_mh, ie.total_hours,
            cl.requirement_review_h AS l_req, cl.code_development_h AS l_code,
            cl.peer_review_fixing_h AS l_peer, cl.bench_testing_h AS l_bench,
            cl.unit_testing_h AS l_unit, cl.total_hours AS l_total
     FROM work_order_items woi
     LEFT JOIN classifications c ON c.work_order_item_id = woi.id
     LEFT JOIN complexity_levels cl ON cl.id = c.complexity_level_id
     LEFT JOIN item_estimations ie ON ie.work_order_item_id = woi.id
     WHERE woi.work_order_id = 52 AND woi.item_number = '01'`
  );
  console.log(JSON.stringify(r.rows[0], null, 2));
  await pool.end();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
