import { format, parseISO, isValid } from 'date-fns';

export const formatDate = (date, fmt = 'MMM d, yyyy') => {
  if (!date) return '';
  try {
    const d = typeof date === 'string' ? parseISO(date) : new Date(date);
    return isValid(d) ? format(d, fmt) : '';
  } catch {
    return '';
  }
};

export const formatDateTime = (date) => formatDate(date, 'MMM d, yyyy · h:mm a');

export const formatDateRange = (start, end) => {
  if (!start) return '';
  const s = formatDate(start, 'MMM d');
  const e = end ? formatDate(end, 'MMM d, yyyy') : '';
  return e ? `${s} – ${e}` : s;
};
