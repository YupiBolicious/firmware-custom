import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function useWOAccess(id, setMessage, setError) {
  const { hasRole } = useAuth();
  const [access, setAccess] = useState([]);
  const [accessBusy, setAccessBusy] = useState(null);
  const [users, setUsers] = useState([]);

  const loadAccess = useCallback(async () => {
    try {
      const res = await api.get(`/work-orders/${id}/access`);
      setAccess(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (err) {
      setAccess([]);
    }
  }, [id]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get('/users/pm');
      setUsers(Array.isArray(res.data.data) ? res.data.data : []);
    } catch (err) {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    loadAccess();
    if (hasRole('ADMIN') || hasRole('PM')) {
      loadUsers();
    }
  }, [id, hasRole, loadAccess, loadUsers]);

  const handleGrantAccess = async (targetUserId) => {
    const targetId = parseInt(targetUserId, 10);
    if (!Number.isInteger(targetId) || targetId < 1) return;
    setError('');
    setAccessBusy('grant');
    try {
      await api.post(`/work-orders/${id}/access`, { user_id: targetId });
      setMessage('Access granted');
      await loadAccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to grant access');
    } finally {
      setAccessBusy(null);
    }
  };

  const handleRevokeAccess = async (targetUserId) => {
    if (!window.confirm('Revoke access for this user?')) return;
    setError('');
    setAccessBusy(targetUserId);
    try {
      await api.delete(`/work-orders/${id}/access/${targetUserId}`);
      setMessage('Access revoked');
      await loadAccess();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to revoke access');
    } finally {
      setAccessBusy(null);
    }
  };

  return { access, accessBusy, users, handleGrantAccess, handleRevokeAccess };
}
