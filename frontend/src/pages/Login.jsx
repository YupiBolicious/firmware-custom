import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1>Firmware Custom</h1>
        <div className="subtitle">Item Classification & Estimation</div>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="pm@demo"
              required
            />
          </div>
          <div className="form-row">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password123"
              required
            />
          </div>
          <button className="btn" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="text-muted mt-16" style={{ fontSize: 12 }}>
          Demo: pm@demo / coder@demo / admin@demo — password: password123
        </div>
      </div>
    </div>
  );
}