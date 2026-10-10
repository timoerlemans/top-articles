/** Reader estimates must be finite and positive; decimals and mixed units are preserved. */
export function parseReadingMinutes(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) && value > 0 ? value : null;
    }
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim().replace(/,/g, ".");
    if (!/^(?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|uur|minutes?|mins?|min)\s*)+$/i.test(normalized)) {
        return null;
    }
    let total = 0;
    for (const match of normalized.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|uur|minutes?|mins?|min)/gi)) {
        total += Number(match[1]) * (/^(h|uur)/i.test(match[2] ?? "") ? 60 : 1);
    }
    return total > 0 && Number.isFinite(total) ? total : null;
}
export function isShort(minutes) {
    return minutes !== null && Number.isFinite(minutes) && minutes > 0 && minutes < 5;
}
export function readingTimeInBucket(minutes, bucket) {
    if (!bucket) {
        return true;
    }
    if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) {
        return false;
    }
    if (bucket === "up-to-5") {
        return isShort(minutes);
    }
    if (bucket === "6-to-10") {
        return minutes >= 5 && minutes <= 10;
    }
    if (bucket === "11-to-20") {
        return minutes > 10 && minutes <= 20;
    }
    if (bucket === "21-to-60") {
        return minutes > 20 && minutes <= 60;
    }
    return bucket === "over-60" && minutes > 60;
}
