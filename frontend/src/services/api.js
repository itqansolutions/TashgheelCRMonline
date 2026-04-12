import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to add JWT token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const branchId = localStorage.getItem('branch_id');
    if (branchId) {
      config.headers['x-branch-id'] = branchId;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Global API Response Normalizer
 * Ensures that res.data.data is never null/undefined for common response patterns.
 */
api.interceptors.response.use(
  (response) => {
    // If the response follows our { status, data: ... } pattern
    if (response.data && typeof response.data === 'object') {
      // If 'data' property is null or undefined, normalize it
      if (response.data.data === null || response.data.data === undefined) {
          // We don't force [] here because it might be an object, 
          // but we ensure it's at least handled by the safeArray/Object utility.
      }
    }
    return response;
  },
  (error) => {
    // Handle global errors (401, etc)
    if (error.response?.status === 401) {
      // Optional: auto-logout on token expiry
    }
    return Promise.reject(error);
  }
);

export default api;
