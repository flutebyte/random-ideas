import apiClient from './client';

export const uploadDocuments = (formData, onProgress) =>
  apiClient.post('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total));
      }
    },
  });

export const getUploadStatus = (id) => apiClient.get(`/uploads/${id}/status`);
