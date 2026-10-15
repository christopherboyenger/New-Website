/** Display helpers for the workspace shell, Home and Live. Report days are UTC; instants are labelled UTC explicitly. */

const utcInstant = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const utcDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** "Oct 15, 14:05 UTC" */
export function formatUtcInstant(date: Date): string {
  return `${utcInstant.format(date)} UTC`;
}

/** "Oct 4" for a YYYY-MM-DD report day. */
export function formatShortDay(day: string): string {
  return utcDay.format(new Date(`${day}T00:00:00.000Z`));
}

/** Coarse relative age: "just now", "4 min ago", "3 h ago", "2 days ago". */
export function formatAge(from: Date, to: Date): string {
  const minutes = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}
