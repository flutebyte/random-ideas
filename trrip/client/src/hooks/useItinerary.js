import { useState, useEffect } from 'react';
import { getItinerary } from '../api/itinerary';

export const useItinerary = (id) => {
  const [itinerary, setItinerary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getItinerary(id)
      .then((res) => setItinerary(res.data.itinerary))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load itinerary'))
      .finally(() => setLoading(false));
  }, [id]);

  return { itinerary, setItinerary, loading, error };
};
