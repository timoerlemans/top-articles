function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readableArrayTag(value: unknown): string | null {
  if (typeof value === "string") {
    const tag = value.trim();
    return tag.length > 0 ? tag : null;
  }
  if (!isRecord(value)) {
    return null;
  }
  for (const key of ["name", "key"] as const) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

/** Returns the complete current tagset, or null when any tag value is unknowable. */
export function completeReaderTagSet(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const tags: string[] = [];
    for (const entry of value) {
      const tag = readableArrayTag(entry);
      if (tag === null) {
        return null;
      }
      tags.push(tag);
    }
    return tags;
  }
  if (!isRecord(value)) {
    return null;
  }
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return null;
  }
  const tags = Object.keys(value);
  return tags.every((tag) => tag.trim().length > 0) ? tags : null;
}
