import { Plane, Hotel, Calendar, MapPin } from 'lucide-react';
import { formatDateRange, formatDateTime } from '../../utils/formatDate';
import { Badge } from '../ui/Badge';

export const TripMeta = ({ extractedData, title }) => {
  if (!extractedData) return null;
  const { origin, destination, departureDate, returnDate, flights, hotels } = extractedData;

  return (
    <div className="rounded-xl border bg-gradient-to-r from-primary/5 to-primary/10 p-6">
      <h1 className="text-2xl font-bold mb-4">{title}</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(origin || destination) && (
          <div className="flex items-start gap-2">
            <div className="rounded-full bg-primary/10 p-1.5 mt-0.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Route</p>
              <p className="text-sm font-medium">
                {[origin, destination].filter(Boolean).join(' → ')}
              </p>
            </div>
          </div>
        )}

        {(departureDate || returnDate) && (
          <div className="flex items-start gap-2">
            <div className="rounded-full bg-primary/10 p-1.5 mt-0.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dates</p>
              <p className="text-sm font-medium">
                {formatDateRange(departureDate, returnDate)}
              </p>
            </div>
          </div>
        )}

        {flights && flights.length > 0 && (
          <div className="flex items-start gap-2">
            <div className="rounded-full bg-primary/10 p-1.5 mt-0.5">
              <Plane className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Flights</p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {flights.slice(0, 3).map((f, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {f.flightNumber || `${f.from}→${f.to}`}
                  </Badge>
                ))}
                {flights.length > 3 && (
                  <Badge variant="outline" className="text-xs">+{flights.length - 3}</Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {hotels && hotels.length > 0 && (
          <div className="flex items-start gap-2">
            <div className="rounded-full bg-primary/10 p-1.5 mt-0.5">
              <Hotel className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Accommodation</p>
              <p className="text-sm font-medium line-clamp-1">{hotels[0].name}</p>
              {hotels.length > 1 && (
                <p className="text-xs text-muted-foreground">+{hotels.length - 1} more</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
