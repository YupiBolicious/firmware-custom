import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      const errors = err.response?.data?.errors;
      setError(
        Array.isArray(errors) && errors.length
          ? errors.join('; ')
          : err.response?.data?.message || 'Failed to send reset link'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="login-brand">
          <div className="login-mark" aria-hidden="true">FC</div>
          <div>
            <h1>Reset Password</h1>
            <div className="subtitle">We will email you a reset link</div>
          </div>
        </div>

        {sent ? (
          <div className="alert alert-success" role="status">
            <div className="alert-title">Check your inbox</div>
            <div className="alert-description">
              If that email is registered, a reset link has been sent. It expires in 30 minutes.
              Check your spam folder if it does not arrive.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="alert alert-error" role="alert">
                <div className="alert-title">Could not send reset link</div>
                <div className="alert-description">{error}</div>
              </div>
            )}
            <div className="form-row">
              <label htmlFor="reset-email">Email</label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <button className="btn login-btn" type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        <div className="login-foot">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}