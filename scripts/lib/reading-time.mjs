export function parseReadingMinutes(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const hours = value.match(/(\d+)\s*(?:hours?|hrs?|uur)/i);
  const minutes = value.match(/(\d+)\s*(?:minutes?|mins?|min)\b/i);
  const total = (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  return total > 0 ? total : null;
}
