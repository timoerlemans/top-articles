export type ReadingTimeValue = number | string | null | undefined;

export function parseReadingMinutes(value: ReadingTimeValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const hours = value.match(/(\d+)\s*(?:hours?|hrs?|uur)/i);
  const minutes = value.match(/(\d+)\s*(?:minutes?|mins?|min)\b/i);
  const total = (hours?.[1] ? Number(hours[1]) * 60 : 0) + (minutes?.[1] ? Number(minutes[1]) : 0);
  return total > 0 ? total : null;
}
