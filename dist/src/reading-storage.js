import { record, READING_NEEDS } from "./reading-profiles.js";
import { READING_MOODS } from "./reading-menu.js";
export function parseHistory(value) {
    if (record(value) && value.version === 1 && (value.generatedAt === null || (typeof value.generatedAt === "string" && Number.isFinite(Date.parse(value.generatedAt)))) && Array.isArray(value.ids) && value.ids.every((id) => typeof id === "string" && id.length > 0)) {
        return { version: 1, generatedAt: value.generatedAt, ids: [...new Set(value.ids)] };
    }
    return { version: 1, generatedAt: null, ids: [] };
}
export function reconcileHistory(history, catalogIds, generatedAt, trusted) {
    const next = Date.parse(generatedAt);
    const previous = Date.parse(history.generatedAt ?? "");
    if (!trusted || !Number.isFinite(next) || (Number.isFinite(previous) && next <= previous)) {
        return history;
    }
    const present = new Set(catalogIds);
    return { version: 1, generatedAt, ids: history.ids.filter((id) => present.has(id)) };
}
export function parseSession(value) {
    if (!record(value) || value.version !== 1 || !record(value.moment)) {
        return null;
    }
    const moment = value.moment;
    if (!["weinig", "gemiddeld", "veel"].includes(String(moment.energy)) || !(moment.mood === null || READING_MOODS.some((mood) => mood === moment.mood))
        || !READING_NEEDS.some((need) => moment.need === need) || typeof moment.budget !== "number" || !Number.isSafeInteger(moment.budget) || moment.budget <= 0
        || !["voorgerecht", "hoofdgerecht", "nagerecht"].includes(String(value.course)) || typeof value.finished !== "boolean"
        || !Array.isArray(value.excluded) || !value.excluded.every((id) => typeof id === "string") || !Array.isArray(value.completed)
        || !value.completed.every((entry) => record(entry) && typeof entry.id === "string" && entry.id.length > 0 && typeof entry.minutes === "number" && Number.isFinite(entry.minutes) && entry.minutes > 0)) {
        return null;
    }
    const completed = value.completed;
    if (new Set(completed.map((entry) => entry.id)).size !== completed.length || completed.reduce((sum, entry) => sum + entry.minutes, 0) > moment.budget) {
        return null;
    }
    // Proposals are always re-planned against the current dataset after restoration.
    return { version: 1, moment: moment, course: value.course, excluded: value.excluded, completed, proposal: null, finished: value.finished };
}
export function readStored(storage, key) {
    try {
        const value = storage?.getItem(key);
        return value ? JSON.parse(value) : null;
    }
    catch {
        return null;
    }
}
export function writeStored(storage, key, value) {
    try {
        if (!storage) {
            return false;
        }
        storage.setItem(key, JSON.stringify(value));
        return true;
    }
    catch {
        return false;
    }
}
/** Adopt concurrent explicit read/unread changes while keeping the newest pruning watermark. */
export function latestHistory(memory, stored) {
    const memoryTime = Date.parse(memory.generatedAt ?? "");
    const storedTime = Date.parse(stored.generatedAt ?? "");
    return { ...stored, generatedAt: Number.isFinite(memoryTime) && (!Number.isFinite(storedTime) || memoryTime > storedTime) ? memory.generatedAt : stored.generatedAt };
}
