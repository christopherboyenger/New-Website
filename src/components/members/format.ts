const numericDate = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
const dateTime = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

/** "10/14/2026" (UTC), the observed "Joined at" format. */
export function formatNumericDate(iso: string): string {
  return numericDate.format(new Date(iso));
}

/** "Oct 21, 2026, 4:05 PM UTC" for invitation times, where the hour matters. */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
