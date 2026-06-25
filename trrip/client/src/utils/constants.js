export const ACCEPTED_MIME_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES = 5;

export const POLL_INTERVAL_MS = 2000;
export const POLL_TIMEOUT_MS = 120000; // 2 minutes

export const ACTIVITY_TYPE_LABELS = {
  flight: 'Flight',
  hotel_checkin: 'Check-in',
  hotel_checkout: 'Check-out',
  sightseeing: 'Sightseeing',
  food: 'Dining',
  transport: 'Transport',
  free: 'Free Time',
  other: 'Activity',
};

export const ACTIVITY_TYPE_COLORS = {
  flight: 'bg-blue-100 text-blue-700',
  hotel_checkin: 'bg-green-100 text-green-700',
  hotel_checkout: 'bg-orange-100 text-orange-700',
  sightseeing: 'bg-purple-100 text-purple-700',
  food: 'bg-yellow-100 text-yellow-700',
  transport: 'bg-gray-100 text-gray-700',
  free: 'bg-teal-100 text-teal-700',
  other: 'bg-slate-100 text-slate-700',
};
