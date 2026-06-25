const mergeDocuments = (extractedDataArray) => {
  if (!extractedDataArray || extractedDataArray.length === 0) return {};

  const merged = {
    origin: null,
    destination: null,
    departureDate: null,
    returnDate: null,
    travelerName: null,
    flights: [],
    hotels: [],
    activities: [],
    rawNotes: '',
  };

  const seenFlights = new Set();
  const seenHotels = new Set();

  for (const data of extractedDataArray) {
    if (!data) continue;

    if (!merged.travelerName && data.travelerName) {
      merged.travelerName = data.travelerName;
    }

    if (data.rawNotes) {
      merged.rawNotes += (merged.rawNotes ? '\n' : '') + data.rawNotes;
    }

    if (Array.isArray(data.flights)) {
      for (const flight of data.flights) {
        if (!flight.flightNumber && !flight.departure) continue;
        const key = `${flight.flightNumber || ''}-${flight.departure || ''}`;
        if (!seenFlights.has(key)) {
          seenFlights.add(key);
          merged.flights.push(flight);
        }
      }
    }

    if (Array.isArray(data.hotels)) {
      for (const hotel of data.hotels) {
        if (!hotel.name) continue;
        const key = `${hotel.name}-${hotel.checkIn || ''}`;
        if (!seenHotels.has(key)) {
          seenHotels.add(key);
          merged.hotels.push(hotel);
        }
      }
    }

    if (Array.isArray(data.activities)) {
      merged.activities.push(...data.activities);
    }
  }

  // Infer trip-level metadata from merged data
  if (merged.flights.length > 0) {
    const sorted = [...merged.flights].sort(
      (a, b) => new Date(a.departure || 0) - new Date(b.departure || 0)
    );
    merged.origin = sorted[0].from;
    merged.destination = sorted[0].to;
    merged.departureDate = sorted[0].departure;
    if (sorted.length > 1) {
      merged.returnDate = sorted[sorted.length - 1].arrival;
    }
  } else if (merged.hotels.length > 0) {
    const sorted = [...merged.hotels].sort(
      (a, b) => new Date(a.checkIn || 0) - new Date(b.checkIn || 0)
    );
    merged.destination = sorted[0].city || sorted[0].name;
    merged.departureDate = sorted[0].checkIn;
    merged.returnDate = sorted[sorted.length - 1].checkOut;
  }

  return merged;
};

module.exports = { mergeDocuments };
