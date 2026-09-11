import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user')) || null;
    } catch {
      return null;
    }
  });
  const [authLoading, setAuthLoading] = useState(() => localStorage.getItem('token') != null);

  useEffect(() => {
    const checkedToken = localStorage.getItem('token');
    if (!checkedToken) return undefined;
    let cancelled = false;
    api.get('/auth/me').then((res) => {
      if (cancelled || localStorage.getItem('token') !== checkedToken) return;
      const serverUser = res.data && res.data.data ? res.data.data.user : null;
      if (serverUser) {
        localStorage.setItem('user', JSON.stringify(serverUser));
        setUser(serverUser);
      }
      setAuthLoading(false);
    }).catch((err) => {
      if (cancelled || localStorage.getItem('token') !== checkedToken) return;
      if (err && err.response && err.response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const login = async (identifier, password) => {
    const res = await api.post('/auth/login', { identifier, password });
    const { token, user: userData } = res.data.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const hasRole = (...roles) => {
    if (!user) return false;
    return roles.some((r) => user.roles.includes(r));
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, hasRole, authLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);