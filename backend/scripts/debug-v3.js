const estimationRepository = require('../src/repositories/estimationRepository');
(async () => {
  const v = await estimationRepository.findVerificationByCode('V3');
  console.log('V3ROW: ' + JSON.stringify(v));
  process.exit(0);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
