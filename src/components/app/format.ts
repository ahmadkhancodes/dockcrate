/** Date formatting shared by server pages and client components (api.ts is a client module, so servers cannot import from it). */
export function formatDate(d: string | number | Date | null | undefined, withTime = false): string {
  if (!d) return "Never";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", withTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }
    : { dateStyle: "medium", timeZone: "UTC" }).format(date) + (withTime ? " UTC" : "");
}
