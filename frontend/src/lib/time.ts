// Relative-time formatter for a past ISO timestamp (e.g. irrigation's
// last_watered_at). Matches the "Xd Yh ago" / "Yh ago" shape
// data/mockData.ts's lastWateredFor() used to fabricate from a seeded
// random value -- this applies the same format to a real timestamp, plus
// a sub-hour case the mock never needed (it never produced under 6h).
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const thenMs = new Date(iso).getTime();
  const totalMinutes = Math.max(0, Math.floor((now.getTime() - thenMs) / (1000 * 60)));
  if (totalMinutes < 1) return 'just now';
  if (totalMinutes < 60) return `${totalMinutes}m ago`;
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h ago` : `${totalHours}h ago`;
}
