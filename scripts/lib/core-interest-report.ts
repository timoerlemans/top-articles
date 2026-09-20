import { FAMILY_DEFINITIONS } from "./unified-lists.js";
import type { DirectDomain } from "./readwise-priority-v2.js";
import type { PriorityDocument } from "./readwise-priority-v2.js";
import type {
  PriorityExport as PriorityExportV6,
  PriorityExportItem as PriorityExportItemV6,
} from "./readwise-priority-v6.js";
import {
  PRIORITY_MODEL,
  SEQUENCE_ORDER,
} from "./readwise-priority-v8.js";
import type {
  PriorityExport as PriorityExportV8,
  PriorityExportItem as PriorityExportItemV8,
  PrioritySequence,
} from "./readwise-priority-v8.js";
import type { CoreInterestPriorityEntry } from "./core-interest-priority.js";

export interface CoreInterestScoreDelta {
  id: string;
  title: string;
  scoreBefore: number;
  scoreAfter: number;
  scoreDelta: number;
  coreInterestBonus: number;
  coreInterests: DirectDomain[];
}

export interface CoreInterestPositionChange extends CoreInterestScoreDelta {
  beforePosition: number | null;
  afterPosition: number | null;
  readwisePosition: number | null;
}

export interface CoreInterestSequenceImpact {
  label: string;
  entries: CoreInterestPositionChange[];
  exits: CoreInterestPositionChange[];
}

export interface CoreInterestImpactReport {
  generatedAt: string;
  beforeModel: PriorityExportV6["model"];
  afterModel: PriorityExportV8["model"];
  interestEvidenceRule: string;
  interests: CoreInterestPriorityEntry[];
  scoreDeltas: CoreInterestScoreDelta[];
  largestMovers: CoreInterestScoreDelta[];
  sequences: Record<PrioritySequence, CoreInterestSequenceImpact>;
}

const INTEREST_EVIDENCE_RULE = "Readwise-posities zijn alleen vergelijkingsuitkomst; ze leveren geen bewijs voor kerninteresses.";
const LARGEST_MOVERS_LIMIT = 20;

function changeOrder(a: CoreInterestPositionChange, b: CoreInterestPositionChange): number {
  return b.scoreDelta - a.scoreDelta || (a.beforePosition ?? Number.POSITIVE_INFINITY) - (b.beforePosition ?? Number.POSITIVE_INFINITY) || a.id.localeCompare(b.id);
}

function scoreDeltaOrder(a: CoreInterestScoreDelta, b: CoreInterestScoreDelta): number {
  return Math.abs(b.scoreDelta) - Math.abs(a.scoreDelta) || b.scoreDelta - a.scoreDelta || a.id.localeCompare(b.id);
}

function positionFor(item: PriorityExportItemV6 | PriorityExportItemV8, sequence: PrioritySequence): number | null {
  return item.positions[sequence] ?? null;
}

function readwisePositionFor(item: PriorityExportItemV8 | PriorityExportItemV6, sequence: PrioritySequence): number | null {
  return item.actualPositions[sequence] ?? null;
}

function coreInterestsFor(item: PriorityExportItemV8): DirectDomain[] {
  return item.coreInterestMatches.map(({ interest }) => interest);
}

export function buildCoreInterestImpactReport(
  documents: readonly PriorityDocument[],
  before: PriorityExportV6,
  after: PriorityExportV8,
  generatedAt = after.generatedAt,
): CoreInterestImpactReport {
  if (before.model !== "readwise-priority-v6" || after.model !== PRIORITY_MODEL) {
    throw new Error("Impactrapport verwacht v6 als uitgangspunt en v8 als kandidaat");
  }
  const titleById = new Map(documents.flatMap((doc) => doc.id ? [[doc.id, doc.title ?? "(zonder titel)"] as const] : []));
  const scoreDeltas: CoreInterestScoreDelta[] = [];

  for (const [id, afterItem] of Object.entries(after.items)) {
    const beforeItem = before.items[id];
    if (!beforeItem) {continue;}
    scoreDeltas.push({
      id,
      title: titleById.get(id) ?? "(zonder titel)",
      scoreBefore: beforeItem.score,
      scoreAfter: afterItem.score,
      scoreDelta: afterItem.score - beforeItem.score,
      coreInterestBonus: afterItem.components.kerninteresse,
      coreInterests: coreInterestsFor(afterItem),
    });
  }
  scoreDeltas.sort(scoreDeltaOrder);

  const sequences = Object.fromEntries(SEQUENCE_ORDER.map((sequence) => {
    const family = FAMILY_DEFINITIONS.find((definition) => definition.sequence === sequence);
    const entries: CoreInterestPositionChange[] = [];
    const exits: CoreInterestPositionChange[] = [];
    for (const delta of scoreDeltas) {
      const beforeItem = before.items[delta.id];
      const afterItem = after.items[delta.id];
      if (!beforeItem || !afterItem || (!beforeItem.sequences.includes(sequence) && !afterItem.sequences.includes(sequence))) {continue;}
      const beforePosition = positionFor(beforeItem, sequence);
      const afterPosition = positionFor(afterItem, sequence);
      const change = {
        ...delta,
        beforePosition,
        afterPosition,
        readwisePosition: readwisePositionFor(afterItem, sequence),
      };
      if (afterPosition !== null && afterPosition <= 100 && (beforePosition === null || beforePosition > 100)) {
        entries.push(change);
      }
      if (beforePosition !== null && beforePosition <= 100 && (afterPosition === null || afterPosition > 100)) {
        exits.push(change);
      }
    }
    entries.sort(changeOrder);
    exits.sort(changeOrder);
    return [sequence, { label: family?.label ?? sequence, entries, exits }];
  })) as Record<PrioritySequence, CoreInterestSequenceImpact>;

  return {
    generatedAt,
    beforeModel: before.model,
    afterModel: after.model,
    interestEvidenceRule: INTEREST_EVIDENCE_RULE,
    interests: after.coreInterestPriority.entries.map((entry) => ({ ...entry })),
    scoreDeltas,
    largestMovers: scoreDeltas.filter(({ scoreDelta }) => scoreDelta !== 0).slice(0, LARGEST_MOVERS_LIMIT),
    sequences,
  };
}

function formatPosition(position: number | null): string {
  return position === null ? "—" : String(position);
}

export function formatCoreInterestImpactMarkdown(report: CoreInterestImpactReport): string {
  const lines = [
    "# Kerninteresse-impactrapport",
    "",
    `Gegenereerd: ${report.generatedAt}`,
    `Model: ${report.beforeModel} → ${report.afterModel}`,
    "",
    `Regel: ${report.interestEvidenceRule}`,
    "",
    "## Kerninteresses",
    "",
    "| Rang | Kerninteresse | Gewicht | Bron | Artikelen | Bewijsscore |",
    "|---:|---|---:|---|---:|---:|",
    ...report.interests.map((entry) => `| ${String(entry.rank)} | ${entry.label} | +${String(entry.weight)} | ${entry.source} | ${String(entry.evidenceDocumentCount)} | ${String(entry.evidenceScore)} |`),
    "",
    "## Grootste scoreverschuivingen",
    "",
    "| Artikel | v6 | v8 | Verschil | Kerninteressebonus |",
    "|---|---:|---:|---:|---:|",
    ...report.largestMovers.map((item) => `| ${item.title} | ${String(item.scoreBefore)} | ${String(item.scoreAfter)} | ${item.scoreDelta >= 0 ? "+" : ""}${String(item.scoreDelta)} | +${String(item.coreInterestBonus)} |`),
    "",
    "## Top-100-bewegingen",
    "",
  ];
  for (const sequence of SEQUENCE_ORDER) {
    const impact = report.sequences[sequence];
    if (!impact || (impact.entries.length === 0 && impact.exits.length === 0)) {continue;}
    lines.push(`### ${impact.label}`, "");
    for (const entry of impact.entries) {
      lines.push(`- Binnen: ${entry.title} (${formatPosition(entry.beforePosition)} → ${formatPosition(entry.afterPosition)}; Readwise ${formatPosition(entry.readwisePosition)})`);
    }
    for (const exit of impact.exits) {
      lines.push(`- Uit: ${exit.title} (${formatPosition(exit.beforePosition)} → ${formatPosition(exit.afterPosition)}; Readwise ${formatPosition(exit.readwisePosition)})`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
