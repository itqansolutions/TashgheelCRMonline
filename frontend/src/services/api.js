import axios from 'axios';

const API_BASE_URL = window.location.origin.includes('localhost:5173') 
  ? 'http://localhost:5000/api' 
  : '/api';

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

export default api;
