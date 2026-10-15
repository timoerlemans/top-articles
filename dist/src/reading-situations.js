import { isReadingTraits } from "./reading-profiles.js";
export const READING_SITUATIONS = [
    { id: "bedtime", label: "In bed voor het slapen", description: "Rustig lezen dat weinig activeert.", budget: 10, energy: "weinig", need: "ontspannen",
        maximumActivation: 1, minimumInterruptibility: null, preferredTones: ["rustig", "warm"] },
    { id: "morning", label: "Net wakker", description: "Een rustige, toegankelijke start van je dag.", budget: 10, energy: "weinig", need: "ontspannen",
        maximumActivation: 2, minimumInterruptibility: null, preferredTones: ["rustig", "warm"] },
    { id: "after-work", label: "Op de bank na een drukke werkdag", description: "Prettige afleiding met weinig benodigde concentratie.", budget: 20, energy: "weinig", need: "afleiding",
        maximumActivation: null, minimumInterruptibility: null, preferredTones: ["rustig", "warm", "speels"] },
    { id: "weekend", label: "Rustig weekend", description: "Ruimte voor reflectie en inhoudelijke verdieping.", budget: 30, energy: "veel", need: "verdieping",
        maximumActivation: null, minimumInterruptibility: null, preferredTones: [] },
    { id: "waiting-room", label: "In de wachtkamer", description: "Gemakkelijk pauzeren wanneer je aan de beurt bent.", budget: 10, energy: "gemiddeld", need: "afleiding",
        maximumActivation: null, minimumInterruptibility: 3, preferredTones: [] },
    { id: "public-transport", label: "Onderweg in het ov", description: "Nieuwe perspectieven die je gemakkelijk kunt hervatten.", budget: 20, energy: "gemiddeld", need: "verkennen",
        maximumActivation: null, minimumInterruptibility: 3, preferredTones: [] },
    { id: "short-break", label: "Korte pauze tussendoor", description: "Een klein leesmoment dat tegen onderbrekingen kan.", budget: 5, energy: "weinig", need: "afleiding",
        maximumActivation: null, minimumInterruptibility: 3, preferredTones: [] },
    { id: "bath", label: "In bad", description: "Rustig en licht lezen terwijl je ontspant.", budget: 20, energy: "weinig", need: "ontspannen",
        maximumActivation: 1, minimumInterruptibility: null, preferredTones: ["rustig", "warm"] },
    { id: "during-work", label: "Tijdens het werk", description: "Een licht, werkgerelateerd stuk dat je makkelijk kunt onderbreken.", budget: 10, energy: "weinig", need: "afleiding",
        maximumActivation: 1, minimumInterruptibility: 3, preferredTones: [], requiredSequences: ["scrum", "software-development", "front-end-development", "social-studies"] },
    { id: "walking-listening", label: "Luisteren tijdens wandelen", description: "Een rustig, helder stuk dat geschikt is om te laten voorlezen.", budget: 30, energy: "gemiddeld", need: "verkennen",
        maximumActivation: 1, minimumInterruptibility: 3, preferredTones: [], listenable: true },
];
export function isSituationId(value) { return READING_SITUATIONS.some(situation => situation.id === value); }
export function situationDefaults(id) {
    const definition = READING_SITUATIONS.find(situation => situation.id === id);
    if (!definition) {
        throw new Error("Onbekend leesmoment");
    }
    return { situation: id, budget: definition.budget, energy: definition.energy, need: definition.need, mood: null };
}
function definitionFor(id) { return READING_SITUATIONS.find(situation => situation.id === id); }
export function fitsSituation(profile, id) {
    if (id === null || id === undefined) {
        return true;
    }
    const definition = definitionFor(id);
    return !!definition && isReadingTraits(profile)
        && (definition.maximumActivation === null || profile.activation <= definition.maximumActivation)
        && (definition.minimumInterruptibility === null || profile.interruptibility >= definition.minimumInterruptibility);
}
export function fitsSituationContent(profile, id, category, sequences) {
    const definition = definitionFor(id);
    if (!definition) {
        return id === null || id === undefined;
    }
    if (definition.requiredSequences && !definition.requiredSequences.some((sequence) => sequences.includes(sequence))) {
        return false;
    }
    if (definition.listenable) {
        return ["article", "email", "rss"].includes(category ?? "") && isReadingTraits(profile)
            && profile.effort <= 1 && profile.emotionalWeight <= 1 && profile.activation <= 1 && profile.interruptibility >= 3;
    }
    return true;
}
export function compareSituationFit(a, b, id) {
    const definition = definitionFor(id);
    if (!definition || !isReadingTraits(a) || !isReadingTraits(b)) {
        return 0;
    }
    return Number(definition.preferredTones.includes(b.tone)) - Number(definition.preferredTones.includes(a.tone))
        || (definition.maximumActivation === null ? 0 : a.activation - b.activation)
        || (definition.minimumInterruptibility === null ? 0 : b.interruptibility - a.interruptibility);
}
