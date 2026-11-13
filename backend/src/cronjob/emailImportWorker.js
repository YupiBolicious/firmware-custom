require ('dotenv').config();
const cron = require('node-cron');
const { importFromGmail } = require('../services/emailImportService'); 

let running = false;

cron.schedule('*/10 * * * *', async () => {
  if (running) {
    console.warn('[Gmail import] Skip: previous run is still in progress');
    return;
  }

  running = true;
  try {
    const result = await importFromGmail({ max: 20 });
    console.log('[Gmail import] Finished', {
      scanned: result.scanned,
      imported: result.imported_count,
      skipped: result.skipped_count,
      failed: result.failed_count,
    });
  } catch (err) {
    console.error('[Gmail import] Failed:', err.message);
  } finally {
    running = false;
  }
});

const runImport = async () => {
  if (running) {
    console.warn('[Gmail import] Skip: previous run is still in progress');
    return;
  }

  running = true;
  try {
    console.log('[Gmail import] Checking Gmail...');
    const result = await importFromGmail({ max: 20 });
    console.log('[Gmail import] Finished', result);
  } catch (err) {
    console.error('[Gmail import] Failed:', err);
  } finally {
    running = false;
  }
};

runImport();
cron.schedule('*/10 * * * *', runImport);

console.log('Cronjob runnging, waiting...');