import { useValueToast } from '../components/Toast';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff } from 'lucide-react';

const LOCK_KEY = 'fcr_login_locked_until';

const fmtRemaining = (ms) => {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  useValueToast(error);
  const [loading, setLoading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(() => Number(window.localStorage.getItem(LOCK_KEY)) || 0);
  const [now, setNow] = useState(() => Date.now());
  const lockedRemaining = Math.max(0, lockedUntil - now);
  const isLocked = lockedRemaining > 0;

  useEffect(() => {
    if (!isLocked) {
      if (window.localStorage.getItem(LOCK_KEY)) window.localStorage.removeItem(LOCK_KEY);
      return undefined;
    }
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLocked, lockedUntil]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLocked) return;
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
      window.localStorage.removeItem(LOCK_KEY);
      navigate('/');
    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfter = Number(err.response?.data?.data?.retry_after) || 300;
        const until = Date.now() + retryAfter * 1000;
        setLockedUntil(until);
        window.localStorage.setItem(LOCK_KEY, String(until));
        setError('');
        return;
      }
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
            <h1>Firmware Custom Request</h1>
            <div className="subtitle">Item Classification & Estimation</div>
          </div>
        </div>
        
        <form onSubmit={handleSubmit}>
          {isLocked && (
            <div className="alert alert-error" role="alert">
              <div className="alert-title">Login temporarily locked</div>
              <div className="alert-description">
                Too many failed login attempts. Try again in {fmtRemaining(lockedRemaining)}, or contact an
                admin to reset your password.
              </div>
            </div>
          )}
          <div className="form-row">
            <label htmlFor="login-identifier">Email or Username</label>
            <input
              id="login-identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@company.com or username"
              disabled={isLocked}
              required
            />
          </div>
          <div className="form-row">
            <label htmlFor="login-password">Password</label>
            <div className="password-field">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                disabled={isLocked}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} strokeWidth={1.5} /> : <Eye size={16} strokeWidth={1.5} />}
              </button>
            </div>
          </div>
          <button className="btn login-btn" type="submit" disabled={loading || isLocked}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        {/* <div className="login-demo">
          <div className="login-demo-title">Demo accounts</div>
          <div className="login-demo-row"><span>pm@demo.com</span><span>PM</span></div>
          <div className="login-demo-row"><span>coder@demo.com</span><span>Coder</span></div>
          <div className="login-demo-row"><span>admin@demo.com</span><span>Admin</span></div>
          <div className="login-demo-row"><span>Password for all</span><span>password123</span></div>
        </div> */}
        <div className="login-foot">Authorized use only</div>
      </div>
    </div>
  );
}
