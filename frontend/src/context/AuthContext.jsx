import React, { createContext, useState, useEffect, useContext } from 'react';
import api from '../services/api';
import { safeArray } from '../utils/dataUtils';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const token = localStorage.getItem('token');
    if (token) {
      fetchUser(isMounted);
    } else {
      setLoading(false);
    }
    return () => { isMounted = false; };
  }, []);

  const fetchUser = async (isMounted = true) => {
    try {
      const res = await api.get('/auth/me');
      const freshUserData = res.data.user || {};
      if (isMounted) {
        setUser(prevUser => {
          const merged = {
            ...(prevUser || {}),
            ...freshUserData,
            allowedPages: safeArray(freshUserData.allowedPages || prevUser?.allowedPages),
            branches: safeArray(freshUserData.branches || prevUser?.branches),
            financialPermissions: safeArray(freshUserData.financialPermissions || prevUser?.financialPermissions)
          };
          return merged;
        });
      }

      // Fetch subscription sequentially before marking ready
      try {
        const subRes = await api.get('/me/subscription');
        const sub = subRes.data?.data || null;
        if (isMounted) setSubscription(sub);
        if (sub) {
          localStorage.setItem('subscription', JSON.stringify(sub));
        }
      } catch (subErr) {
        console.warn('Subscription fetch failed; failing closed on optional modules:', subErr.message);
        // Fail closed on optional modules, but do not log out
        const fallbackSub = {
          plan: 'basic',
          plan_name: 'basic',
          status: 'error',
          modules: {}
        };
        if (isMounted) setSubscription(fallbackSub);
      }

    } catch (err) {
      console.error('Failed to fetch user', err.message);
      // Only log out if the server explicitly returned 401 Unauthorized
      if (err.response?.status === 401) {
        logout();
      }
      // On network errors / 5xx / timeouts, preserve session as fallback
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user: userData } = res.data;
    localStorage.setItem('token', token);
    
    // 🔥 NEW: Auto-Selection Context logic
    if (userData.branch_id) {
        localStorage.setItem('branch_id', userData.branch_id);
    }

    setUser({
      ...userData,
      isDemo: userData.isDemo || false,
      allowedPages: safeArray(userData.allowedPages),
      branches: safeArray(userData.branches),
      financialPermissions: safeArray(userData.financialPermissions)
    });

    // Fetch subscription on login sequentially with fail-closed fallback
    try {
      const subRes = await api.get('/me/subscription');
      const sub = subRes.data?.data || null;
      setSubscription(sub);
      if (sub) {
        localStorage.setItem('subscription', JSON.stringify(sub));
      }
    } catch (subErr) {
      console.warn('Subscription fetch failed on login; failing closed on optional modules:', subErr.message);
      const fallbackSub = {
        plan: 'basic',
        plan_name: 'basic',
        status: 'error',
        modules: {}
      };
      setSubscription(fallbackSub);
    }

    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('subscription');
    setUser(null);
    setSubscription(null);
  };

  /**
   * Helper to verify if current user has a specific financial permission.
   * Admins are always allowed as superusers.
   * Otherwise checks user.financialPermissions array.
   */
  const hasFinancialPermission = (perm) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const perms = safeArray(user.financialPermissions);
    return perms.includes(perm);
  };

  return (
    <AuthContext.Provider value={{ user, subscription, loading, login, logout, isAuthenticated: !!user, hasFinancialPermission }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export { AuthContext };
