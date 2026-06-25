import { useState, useEffect, useCallback } from 'react';
import { listItineraries } from '../api/itinerary';

export const useItineraries = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  const fetch = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await listItineraries({ page, limit: 12 });
      setData(res.data.data);
      setPagination({ page: res.data.page, pages: res.data.pages, total: res.data.total });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load itineraries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch(1);
  }, [fetch]);

  return { data, loading, error, pagination, refetch: fetch };
};
