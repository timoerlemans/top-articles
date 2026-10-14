import { isReadingTraits } from "./reading-profiles.js";
import type { MenuTraits, ReadingNeed, ReadingTone } from "./reading-profiles.js";
import type { Energy, ReadingMoment } from "./reading-menu.js";

interface SituationDefinition {
  id: string;
  label: string;
  description: string;
  budget: number;
  energy: Energy;
  need: ReadingNeed;
  maximumActivation: number | null;
  minimumInterruptibility: number | null;
  preferredTones: readonly ReadingTone[];
}
export const READING_SITUATIONS = [
  { id: "bedtime", label: "In bed voor het slapen", description: "Rustig lezen dat weinig activeert.", budget: 10, energy: "weinig", need: "ontspannen",
    maximumActivation: 1, minimumInterruptibility: null, preferredTones: ["rustig", "warm"] },
  { id: "morning", label: "Net wakker", description: "Een rustige, toegankelijke start van je dag.", budget: 10, energy: "weinig", need: "ontspannen",
    maximumActivation: 2, minimumInterruptibility: null, preferredTones: ["rustig", "warm"] },
  { id: "after-work", label: "Op de bank na een drukke werkdag", description: "Prettige afleiding met weinig benodigde concentratie.", budget: 20, energy: "weinig", need: "afleiding",
    maximumActivation: null, minimumInterruptibility: null, preferredTones: ["rustig", "warm", "speels"] },
  { id: "weekend", label: "Rustig weekend", description: "Ruimte voor reflectie en inhoudelijke verdieping.", budget: 30, energy: "veel", need: "verdieping",
    maximumActivation: null, minimumInterruptibility: null, preferredTones: [] },
] as const satisfies readonly SituationDefinition[];
export type SituationId = typeof READING_SITUATIONS[number]["id"];
export function isSituationId(value: unknown): value is SituationId { return READING_SITUATIONS.some(situation => situation.id === value); }
export function situationDefaults(id: SituationId): ReadingMoment {
  const definition = READING_SITUATIONS.find(situation => situation.id === id);
  if (!definition) { throw new Error("Onbekend leesmoment"); }
  return { situation: id, budget: definition.budget, energy: definition.energy, need: definition.need, mood: null };
}
function definitionFor(id: SituationId | null | undefined): SituationDefinition | undefined { return READING_SITUATIONS.find(situation => situation.id === id); }
export function fitsSituation(profile: MenuTraits, id: SituationId | null | undefined): boolean {
  if (id === null || id === undefined) { return true; }
  const definition = definitionFor(id);
  return !!definition && isReadingTraits(profile)
    && (definition.maximumActivation === null || profile.activation <= definition.maximumActivation)
    && (definition.minimumInterruptibility === null || profile.interruptibility >= definition.minimumInterruptibility);
}
export function compareSituationFit(a: MenuTraits, b: MenuTraits, id: SituationId | null | undefined): number {
  const definition = definitionFor(id);
  if (!definition || !isReadingTraits(a) || !isReadingTraits(b)) { return 0; }
  return Number(definition.preferredTones.includes(b.tone)) - Number(definition.preferredTones.includes(a.tone))
    || (definition.maximumActivation === null ? 0 : a.activation - b.activation)
    || (definition.minimumInterruptibility === null ? 0 : b.interruptibility - a.interruptibility);
}
