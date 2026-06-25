import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { ActivityItem } from './ActivityItem';
import { formatDate } from '../../utils/formatDate';

export const DayBlock = ({ day, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-5 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
            {day.dayNumber}
          </div>
          <div>
            <p className="font-semibold">{day.title}</p>
            {day.date && (
              <p className="text-sm text-muted-foreground">{formatDate(day.date, 'EEEE, MMM d')}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {day.activities?.length || 0} activities
          </span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-300',
          open ? 'max-h-[9999px]' : 'max-h-0'
        )}
      >
        <div className="px-5 pb-4 divide-y">
          {(day.activities || []).map((activity, i) => (
            <ActivityItem key={i} activity={activity} />
          ))}
          {(!day.activities || day.activities.length === 0) && (
            <p className="py-4 text-sm text-muted-foreground text-center">
              No activities for this day
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
