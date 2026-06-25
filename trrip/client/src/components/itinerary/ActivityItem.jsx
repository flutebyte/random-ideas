import { Plane, Hotel, Camera, Utensils, Car, Smile, Clock, Tag } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ACTIVITY_TYPE_LABELS, ACTIVITY_TYPE_COLORS } from '../../utils/constants';

const ACTIVITY_ICONS = {
  flight: Plane,
  hotel_checkin: Hotel,
  hotel_checkout: Hotel,
  sightseeing: Camera,
  food: Utensils,
  transport: Car,
  free: Smile,
  other: Clock,
};

export const ActivityItem = ({ activity }) => {
  const { time, type, title, description, location, durationMinutes, bookingRef } = activity;
  const Icon = ACTIVITY_ICONS[type] || Clock;
  const colorClass = ACTIVITY_TYPE_COLORS[type] || ACTIVITY_TYPE_COLORS.other;
  const label = ACTIVITY_TYPE_LABELS[type] || 'Activity';

  return (
    <div className="flex gap-4 py-4">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-mono text-muted-foreground w-12 text-right flex-shrink-0">
          {time || ''}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              colorClass
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </span>
          {bookingRef && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
              <Tag className="h-3 w-3" />
              {bookingRef}
            </span>
          )}
        </div>
        <h4 className="mt-1 font-semibold text-sm">{title}</h4>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        )}
        <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
          {location && (
            <span className="flex items-center gap-1">
              📍 {location}
            </span>
          )}
          {durationMinutes && (
            <span className="flex items-center gap-1">
              ⏱ {durationMinutes >= 60
                ? `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 ? ` ${durationMinutes % 60}m` : ''}`
                : `${durationMinutes}m`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
