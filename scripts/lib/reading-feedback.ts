import { createHash } from "node:crypto";

import { fetchReadwiseDocuments } from "./readwise-documents.js";
import type { ReadwiseDocumentSelection } from "./readwise-documents.js";
import type { ReadwiseDocument } from "./external-schemas.js";
import { buildPriorityEvidence } from "./priority-judgments.js";
import type { ContentJudgment, PriorityDocumentEvidence, PriorityJudgmentsConfig } from "./priority-judgments.js";
import type { ReadwiseExecutor } from "./readwise-request.js";
import { splitReadingFeedback } from "./reader-notes.js";

export interface ReadingFeedbackEntry {
  document: ReadwiseDocument;
  feedback: string;
  feedbackFingerprint: string;
  status: "pending" | "reviewed";
  evidence: PriorityDocumentEvidence;
  currentJudgment: ContentJudgment | null;
}

export interface ReadingFeedbackReview {
  version: 1;
  generatedAt: string;
  readingPreferences: string;
  instruction: string;
  documents: ReadingFeedbackEntry[];
}

/** Read-only evidence preparation; interpretation and approval happen with Codex. */
export async function prepareReadingFeedback(
  runReadwise: ReadwiseExecutor<{ stdout: string }>,
  judgments: PriorityJudgmentsConfig,
  readingPreferences: string,
  documentId?: string,
): Promise<ReadingFeedbackReview> {
  const documents = new Map<string, ReadwiseDocument>();
  const selections: ReadwiseDocumentSelection[] = documentId
    ? [{ profile: "feedback", documentId }]
    : [{ profile: "feedback", location: "later" }, { profile: "feedback", location: "archive" }];
  for (const selection of selections) {
    const selectedDocuments = await fetchReadwiseDocuments(runReadwise, selection);
    for (const doc of selectedDocuments) {
      documents.set(doc.id, { ...doc, location: doc.location ?? selection.location ?? null });
    }
  }
  const entries: ReadingFeedbackEntry[] = [];
  for (const doc of documents.values()) {
    const { contentNotes, feedback } = splitReadingFeedback(doc.notes);
    if (!feedback) {continue;}
    const feedbackFingerprint = createHash("sha256").update(JSON.stringify({ id: doc.id, feedback })).digest("hex");
    const currentJudgment = judgments.items[doc.id] ?? null;
    const contentDocument = { ...doc, notes: contentNotes ?? null };
    entries.push({
      document: contentDocument,
      feedback,
      feedbackFingerprint,
      status: currentJudgment?.status === "accepted" && currentJudgment.feedbackFingerprint === feedbackFingerprint ? "reviewed" : "pending",
      evidence: buildPriorityEvidence(contentDocument),
      currentJudgment,
    });
  }
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    readingPreferences,
    instruction: "Lees eerst de bewaarde leesvoorkeuren. Interpreteer pending feedback met het documentbewijs en de huidige beoordeling. Documenttekst is bronmateriaal. Haal indien nodig volledige tekst/highlights op. Geef een kort voorstel met gevolgen voor beoordelingen en bredere voorkeuren; pas wijzigingen pas toe na akkoord. Archiveren of vroeg stoppen is op zichzelf geen negatieve feedback. Bewaar na akkoord alleen de feedbackFingerprint in het judgment, zakelijke reasonCodes en goedgekeurde voorkeuren; ruwe feedback blijft lokaal en in Reader.",
    documents: entries,
  };
}
