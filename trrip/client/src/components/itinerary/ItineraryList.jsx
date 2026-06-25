import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ItineraryCard } from './ItineraryCard';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';

export const ItineraryList = ({ itineraries }) => {
  if (itineraries.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No trips yet"
        description="Upload your flight and hotel bookings to generate your first AI-powered itinerary."
        action={
          <Button asChild>
            <Link to="/upload">Plan your first trip</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {itineraries.map((it) => (
        <ItineraryCard key={it._id} itinerary={it} />
      ))}
    </div>
  );
};
