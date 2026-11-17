import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';

export default function EmailRequestWorkOrder() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const started = useRef(false);
  const [state, setState] = useState({ loading: true, message: '', workOrder: null, error: '' });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState({ loading: false, message: '', workOrder: null, error: 'Request link is missing its token.' });
      return;
    }

    api.post('/email/request-wo', { token })
      .then((response) => {
        setState({
          loading: false,
          message: response.data?.message || 'Work order request completed.',
          workOrder: response.data?.data?.work_order || null,
          error: '',
        });
      })
      .catch((err) => {
        setState({
          loading: false,
          message: '',
          workOrder: null,
          error: err.response?.data?.message || 'Could not process this request link.',
        });
      });
  }, [token]);

  return (
    <main className="glass-page" style={{ maxWidth: 640, margin: '48px auto', padding: 24 }}>
      <section className="panel" aria-live="polite">
        <h1>Work Order Request</h1>
        {state.loading && <p>Processing your request…</p>}
        {!state.loading && state.error && <div className="alert alert-error" role="alert">{state.error}</div>}
        {!state.loading && state.message && (
          <>
            <p>{state.message}</p>
            {state.workOrder?.wo_number && <p>Work Order: <strong>{state.workOrder.wo_number} - {state.workOrder.customer}</strong></p>}
          </>
        )}
      </section>
    </main>
  );
}
