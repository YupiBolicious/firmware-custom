require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS machine_model_id INT REFERENCES machine_model(id)');
    console.log('Added machine_model_id column');
    await client.query('ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS machine_model_version_id INT REFERENCES machine_model_ver(id)');
    console.log('Added machine_model_version_id column');

    await client.query(`INSERT INTO machine_model (model_code, name, description) VALUES
      ('FWX-100', 'FWX-100 Series', 'Base firmware platform for standard production units'),
      ('FWX-200', 'FWX-200 Series', 'Advanced platform with expanded I/O and connectivity'),
      ('FWX-300', 'FWX-300 Series', 'High-performance platform for industrial applications')
      ON CONFLICT (model_code) DO NOTHING`);
    console.log('Seeded machine models');

    const models = (await client.query(
      'SELECT id, model_code FROM machine_model WHERE model_code IN ($1,$2,$3) ORDER BY model_code',
      ['FWX-100','FWX-200','FWX-300']
    )).rows;
    const m100 = models.find(m => m.model_code === 'FWX-100');
    const m200 = models.find(m => m.model_code === 'FWX-200');
    const m300 = models.find(m => m.model_code === 'FWX-300');

    const versions = [
      [m100 && m100.id, [['v1.0','Initial release'],['v2.0','Updated communication protocols']]],
      [m200 && m200.id, [['v1.0','Initial release'],['v1.1','Bugfix release'],['v2.0','Major rewrite with new HAL']]],
      [m300 && m300.id, [['v1.0','Initial release']]]
    ];

    for (const [mid, vers] of versions) {
      if (!mid) continue;
      for (const [vc, desc] of vers) {
        await client.query(
          'INSERT INTO machine_model_ver (machine_model_id, version_code, description) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [mid, vc, desc]
        );
      }
    }
    console.log('Seeded machine model versions');
    console.log('Migration complete');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(e => { console.error(e.message); process.exit(1); });
