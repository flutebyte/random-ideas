import apiClient from './client';

export const listItineraries = (params) => apiClient.get('/itineraries', { params });
export const createItinerary = (data) => apiClient.post('/itineraries', data);
export const getItinerary = (id) => apiClient.get(`/itineraries/${id}`);
export const getItineraryStatus = (id) => apiClient.get(`/itineraries/${id}/status`);
export const updateItinerary = (id, data) => apiClient.patch(`/itineraries/${id}`, data);
export const deleteItinerary = (id) => apiClient.delete(`/itineraries/${id}`);
export const toggleShare = (id, isPublic) =>
  apiClient.post(`/itineraries/${id}/share`, { isPublic });
export const regenerateItinerary = (id, customNotes) =>
  apiClient.post(`/itineraries/${id}/regenerate`, { customNotes });
