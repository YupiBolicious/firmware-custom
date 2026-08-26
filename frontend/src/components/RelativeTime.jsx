const UNITS = [
  { limit: 60, divisor: 1, unit: 's' },
  { limit: 3600, divisor: 60, unit: 'm' },
  { limit: 86400, divisor: 3600, unit: 'h' },
  { limit: 604800, divisor: 86400, unit: 'd' },
  { limit: 2592000, divisor: 604800, unit: 'w' },
];

export default function RelativeTime({ date }) {
  if (!date) return null;
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  for (const { limit, divisor, unit } of UNITS) {
    if (seconds < limit) {
      return `${Math.floor(seconds / divisor)}${unit} ago`;
    }
  }
  return `${Math.floor(seconds / 2592000)}mo ago`;
}
