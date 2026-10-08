import { useValueToast } from '../components/Toast';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function ChangePassword() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [original, setOriginal] = useState({ full_name: user?.full_name || '', email: user?.email || '' });
  const [saved, setSaved] = useState(false);
  const dirty = fullName !== original.full_name || email !== original.email;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  useValueToast(error);
  const [loading, setLoading] = useState(false);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    setLoading(true);
    try {
      const res = await api.put('/auth/me/profile', {
        email,
        full_name: fullName,
      });
      const serverUser = res.data?.data?.user;
      if (serverUser) {
        updateUser(serverUser);
        setFullName(serverUser.full_name);
        setEmail(serverUser.email);
        setOriginal({ full_name: serverUser.full_name, email: serverUser.email });
      }
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileCancel = () => {
    setFullName(original.full_name);
    setEmail(original.email);
    setSaved(false);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }
    setLoading(true);
    try {
      await api.put('/auth/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      logout();
      navigate('/login');
    } catch (err) {
      const errors = err.response?.data?.errors;
      setError(
        Array.isArray(errors) && errors.length
          ? errors.join('; ')
          : err.response?.data?.message || 'Failed to change password'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Change Password</h1>
      <div className="flex justify-center" style={{ gap: 24, flexWrap: 'wrap', maxWidth: 1024, margin: '0 auto', alignItems: 'flex-start' }}>
        <div className="panel flex-1" style={{ minWidth: 300, maxWidth: 480 }}>
          <h3 style={{ margin: '0 0 12px' }}>Account Details</h3>
          <form onSubmit={handleProfileSubmit}>
            <div className="form-row">
              <label>Full Name</label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="form-row">
              <label>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-row">
              <label>Username</label>
              <input type="text" value={user?.username || ''} disabled />
            </div>
            <div className="flex items-center gap-3 justify-end mt-4">
              {saved && <span style={{ fontSize: 13, color: 'var(--success)' }}>Profile updated</span>}
              {dirty && (
                <button className="btn btn-secondary" type="button" onClick={handleProfileCancel} disabled={loading}>
                  Cancel
                </button>
              )}
              <button className="btn" type="submit" disabled={loading || !dirty}>
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        <div className="panel flex-1" style={{ minWidth: 300, maxWidth: 480 }}>
          <h3 style={{ margin: '0 0 12px' }}>Update Password</h3>
          <form onSubmit={handlePasswordSubmit}>
            <div className="form-row">
              <label>Current Password</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="form-row">
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 8 characters" minLength={8} required />
            </div>
            <div className="form-row">
              <label>Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
            </div>
            <div className="flex items-center gap-8 mt-3">
              <button className="btn ml-auto" type="submit" disabled={loading}>
                {loading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}