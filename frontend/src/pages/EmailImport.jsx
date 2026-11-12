import { useState } from 'react';
import api from '../api/client';

export default function EmailImport() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const runImport = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await api.post('/gmail/import', { max: 20 });
      setResult(response.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Gmail import gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <h2>Import WO dari Gmail</h2>
      <button className="btn" onClick={runImport} disabled={loading}>
        {loading ? 'Memproses...' : 'Import email'}
      </button>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      {result && (
        <>
          <p>
            Dipindai: {result.scanned} · Berhasil: {result.imported_count} ·
            Dilewati: {result.skipped_count} · Gagal: {result.failed_count}
          </p>

          {[
            ['Imported', result.imported],
            ['Skipped', result.skipped],
            ['Failed', result.failed],
          ].map(([title, rows]) => (
            <section key={title}>
              <h3>{title}</h3>
              {rows.length === 0 ? <p>Tidak ada.</p> : (
                <ul>
                  {rows.map((row, index) => (
                    <li key={`${row.message_id}-${row.filename || index}`}>
                      {row.filename || row.from || row.message_id}
                      {' — '}
                      {row.wo_number || ''}
                      {' — '}
                      {row.status || row.reason || row.action}
                      {row.analysis
                        ? ` — ${row.analysis.total_items} item, ${row.analysis.waiting_review} perlu review`
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}