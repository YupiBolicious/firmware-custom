const repo = require('../src/repositories/coderDashboardRepository');

(async () => {
  const total = await repo.countWorkOrderQueue({});
  console.log('WO_QUEUE_TOTAL: ' + total);
  const page1 = await repo.findWorkOrderQueue({ page: 1, limit: 10 });
  page1.slice(0, 10).forEach((r) => console.log(
    `  ${r.wo_number} [${r.status}] items=${r.item_count} open=${r.open_count} done=${r.done_count} hrs=${r.total_hours}`
  ));
  const search = await repo.findWorkOrderQueue({ page: 1, limit: 10, search: 'WO-TEST' });
  console.log('SEARCH_WO-TEST: ' + search.map((r) => r.wo_number).join(', '));
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
