export const READING_NEEDS = ["ontspannen", "afleiding", "herkenning", "verkennen", "verdieping"];
export const READING_TONES = ["rustig", "speels", "warm", "reflectief", "zakelijk", "intens"];
export function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function rating(value) {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}
export function isLegacyReadingTraits(value) {
    return record(value) && rating(value.effort) && rating(value.emotionalWeight)
        && READING_TONES.some((tone) => tone === value.tone) && record(value.needFit)
        && READING_NEEDS.every((need) => record(value.needFit) && rating(value.needFit[need]));
}
export function isReadingTraits(value) {
    return isLegacyReadingTraits(value) && record(value) && rating(value.activation) && rating(value.interruptibility);
}
export function safeTraits(profile, version) {
    const legacy = { effort: profile.effort, emotionalWeight: profile.emotionalWeight, tone: profile.tone,
        needFit: Object.fromEntries(READING_NEEDS.map((need) => [need, profile.needFit[need]])) };
    if (version === 1) {
        return legacy;
    }
    if (!isReadingTraits(profile)) {
        throw new Error("Incomplete v2 reading traits");
    }
    return { ...legacy, activation: profile.activation, interruptibility: profile.interruptibility };
}
export function parseReadingMenu(value) {
    if (!record(value) || (value.version !== 1 && value.version !== 2) || value.scope !== "later" || value.complete !== true
        || !record(value.profiles)) {
        return null;
    }
    const version = value.version;
    const valid = version === 1 ? isLegacyReadingTraits : isReadingTraits;
    if (!Object.entries(value.profiles).every(([id, profile]) => id.length > 0 && valid(profile))) {
        return null;
    }
    // Project explicitly so private evidence cannot accidentally flow into consumers.
    return { version, scope: "later", complete: true, profiles: Object.fromEntries(Object.entries(value.profiles).map(([id, profile]) => {
            if (!valid(profile)) {
                throw new Error("Unreachable invalid profile");
            }
            return [id, safeTraits(profile, version)];
        })) };
}
