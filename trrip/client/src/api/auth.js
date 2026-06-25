import apiClient from './client';

export const register = (data) => apiClient.post('/auth/register', data);
export const login = (data) => apiClient.post('/auth/login', data);
export const getMe = () => apiClient.get('/auth/me');
