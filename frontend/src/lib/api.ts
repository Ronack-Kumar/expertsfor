import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// A 401 means the saved login is no longer valid (expired, or the account no longer
// exists). Clear it and send the user to sign in instead of leaving a dead screen.
// Auth endpoints are excluded so wrong-password errors still show on the form.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url: string = error?.config?.url ?? '';
    if (status === 401 && typeof window !== 'undefined' && !url.includes('/auth/')) {
      localStorage.removeItem('token');
      localStorage.removeItem('workspace_id');
      const onAuthPage = /^\/(login|register|verify-email|forgot-password|reset-password)/.test(window.location.pathname);
      if (!onAuthPage) window.location.replace('/login?session=expired');
    }
    return Promise.reject(error);
  },
);
