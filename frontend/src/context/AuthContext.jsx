import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { safeArray } from '../utils/dataUtils';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on mount
    const token = localStorage.getItem('token');
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const res = await api.get('/auth/me');
      const userData = res.data.user;
      setUser({
        ...userData,
        allowedPages: safeArray(userData.allowedPages),
        branches: safeArray(userData.branches)
      });

      // Load subscription (cached or fresh)
      const cached = localStorage.getItem('subscription');
      if (cached) setSubscription(JSON.parse(cached));

      // Fetch fresh from API (non-blocking)
      api.get('/me/subscription').then(subRes => {
        const sub = subRes.data.data;
        setSubscription(sub);
        localStorage.setItem('subscription', JSON.stringify(sub));
      }).catch(() => {});

    } catch (err) {
      console.error('Failed to fetch user', err);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user: userData } = res.data;
    localStorage.setItem('token', token);
    setUser({
      ...userData,
      isDemo: userData.isDemo || false,
      allowedPages: safeArray(userData.allowedPages),
      branches: safeArray(userData.branches)
    });

    // Fetch subscription on login
    try {
      const subRes = await api.get('/me/subscription');
      const sub = subRes.data.data;
      setSubscription(sub);
      localStorage.setItem('subscription', JSON.stringify(sub));
    } catch {}

    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('subscription');
    setUser(null);
    setSubscription(null);
  };

  return (
    <AuthContext.Provider value={{ user, subscription, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export { AuthContext };
