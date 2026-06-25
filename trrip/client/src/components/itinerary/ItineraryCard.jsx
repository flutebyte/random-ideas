import { Link } from 'react-router-dom';
import { MapPin, Calendar, Globe, Lock, Plane } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { formatDateRange } from '../../utils/formatDate';

export const ItineraryCard = ({ itinerary }) => {
  const { _id, title, extractedData, isPublic, itinerary: gen, createdAt } = itinerary;
  const statusColor = {
    done: 'success',
    generating: 'warning',
    failed: 'destructive',
    pending: 'outline',
  };

  return (
    <Link to={`/itinerary/${_id}`}>
      <Card className="group h-full cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {title}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isPublic ? (
                <Badge variant="outline" className="text-xs gap-1">
                  <Globe className="h-3 w-3" />
                  Shared
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs gap-1 text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Private
                </Badge>
              )}
            </div>
          </div>

          {extractedData && (
            <div className="space-y-1.5 mb-3">
              {(extractedData.origin || extractedData.destination) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Plane className="h-3 w-3" />
                  <span>
                    {[extractedData.origin, extractedData.destination]
                      .filter(Boolean)
                      .join(' → ')}
                  </span>
                </div>
              )}
              {(extractedData.departureDate || extractedData.returnDate) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {formatDateRange(extractedData.departureDate, extractedData.returnDate)}
                  </span>
                </div>
              )}
              {extractedData.destination && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span>{extractedData.destination}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <Badge variant={statusColor[gen?.status] || 'outline'} className="text-xs">
              {gen?.status === 'done'
                ? `${gen.days?.length || 0} days`
                : gen?.status === 'generating'
                ? 'Generating…'
                : gen?.status === 'failed'
                ? 'Failed'
                : 'Pending'}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(createdAt).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};
