import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const id = identifier.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id);
    const isUsername = /^[a-zA-Z0-9@._-]{3,100}$/.test(id);
    if (!isEmail && !isUsername) {
      setError('Enter a valid email address or username');
      return;
    }
    setLoading(true);
    try {
      await login(identifier, password);
      navigate('/');
    } catch (err) {
      const errors = err.response?.data?.errors;
      setError(
        Array.isArray(errors) && errors.length
          ? errors.join('; ')
          : err.response?.data?.message || 'Login failed'
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
            <h1>Firmware Custom</h1>
            <div className="subtitle">Item Classification & Estimation</div>
          </div>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="login-identifier">Email or Username</label>
            <input
              id="login-identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@company.com or username"
              required
            />
          </div>
          <div className="form-row">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              required
            />
          </div>
          <button className="btn login-btn" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="login-demo">
          <div className="login-demo-title">Demo accounts</div>
          <div className="login-demo-row"><span>pm@demo.com</span><span>PM</span></div>
          <div className="login-demo-row"><span>coder@demo.com</span><span>Coder</span></div>
          <div className="login-demo-row"><span>admin@demo.com</span><span>Admin</span></div>
          <div className="login-demo-row"><span>Password for all</span><span>password123</span></div>
        </div>
        <div className="login-foot">Authorized use only</div>
      </div>
    </div>
  );
}
