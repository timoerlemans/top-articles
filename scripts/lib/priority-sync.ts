import { z } from "zod";
import { buildPriorityTagPlan, tagNames, validatePriorityTagPlan } from "./priority-tag-plan.js";
import type { PriorityTagPlan } from "./priority-tag-plan.js";
import { applyPriorityDocumentUpdates } from "./priority-apply.js";
import type { DocumentBatchResult, PriorityJournal, PriorityOperation } from "./priority-apply.js";
import { buildDocumentTagUpdates } from "./priority-batch.js";
import type { DocumentTagUpdate } from "./priority-batch.js";
import { fetchReadwiseDocuments } from "./readwise-documents.js";
import type { ReadwiseDocumentLocation } from "./readwise-documents.js";
import type { ReadwiseDocument } from "./external-schemas.js";
import type { Delay, ReadwiseExecutor } from "./readwise-request.js";
import { validatePriorityJudgments } from "./priority-judgments.js";
import { validateCoreInterestPriorityConfig } from "./core-interest-priority.js";

const LOCATIONS: readonly ReadwiseDocumentLocation[] = ["later", "new", "shortlist", "archive", "feed"];
const overridesSchema = z.object({
  version: z.literal(1),
  items: z.record(z.string(), z.object({ adjustment: z.number().optional(), reason: z.string().nullable().optional() })),
});
const operationSchema = z.object({ action: z.enum(["add", "remove"]), documentId: z.string(), tag: z.string() });
const journalSchema = z.looseObject({
  planHash: z.string(),
  startedAt: z.string(),
  completed: z.array(operationSchema),
  failures: z.array(operationSchema.extend({ attempt: z.number(), at: z.string(), message: z.string() })).default([]),
  bulkFailures: z.array(z.object({ at: z.string(), attempt: z.number(), documents: z.array(z.string()), message: z.string() })).optional(),
  verified: z.boolean().optional(),
  completedAt: z.string().optional(),
});
const bulkResultSchema = z.looseObject({
  results: z.array(z.looseObject({
    id: z.string(), success: z.boolean(), error: z.union([z.string(), z.looseObject({}), z.null()]).optional(),
  })),
});

export interface PrioritySyncOptions { generatedAt?: string | undefined; cleanupAll?: boolean | undefined; }
export type PrioritySyncEvent =
  | { type: "round"; round: number; operations: number; documents: number }
  | { type: "progress"; round: number; completed: number; total: number };
export interface PrioritySyncDependencies {
  /** Reads use the existing paced/retrying requester; mutation retries belong to tag execution. */
  readwise: ReadwiseExecutor<{ stdout: string }>;
  mutate: ReadwiseExecutor<{ stdout: string }>;
  loadConfiguration: () => Promise<{ overrides: unknown; judgments: unknown; coreInterestConfig: unknown }>;
  journal: {
    read: (path: string) => Promise<unknown>;
    write: (path: string, value: PriorityJournal) => Promise<void>;
  };
  now?: () => string;
  delay?: Delay;
  onEvent?: (event: PrioritySyncEvent) => void;
}

function operationKey(operation: PriorityOperation): string {
  return JSON.stringify([operation.action, operation.documentId, operation.tag]);
}

/** A full-set replacement is safe only when the decoder retained every supplied tag. */
function completeTagNames(doc: ReadwiseDocument): string[] | null {
  if (typeof doc.tags !== "object" || doc.tags === null) { return null; }
  const names = tagNames(doc);
  const supplied = Array.isArray(doc.tags) ? doc.tags.length : Object.keys(doc.tags).length;
  return names.length === supplied ? names : null;
}

/**
 * Owns the confirmed priority-tag workflow. Transport/configuration/storage adapters vary;
 * callers do not compose freshness, journal recovery, tag preservation or repair themselves.
 */
export function createPrioritySync({
  readwise, mutate, loadConfiguration, journal: storage,
  now = () => new Date().toISOString(),
  delay = (milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  onEvent = () => {},
}: PrioritySyncDependencies) {
  async function snapshot(options: PrioritySyncOptions = {}): Promise<{ plan: PriorityTagPlan; documents: ReadwiseDocument[] }> {
    async function fetchLibrary() {
      const later: ReadwiseDocument[] = [];
      const outside: ReadwiseDocument[] = [];
      for (const location of options.cleanupAll ? LOCATIONS : ["later"] as const) {
        const documents = await fetchReadwiseDocuments(readwise, { profile: "maintenance", location });
        (location === "later" ? later : outside).push(...documents);
      }
      return { later, outside };
    }
    const [{ later, outside }, config] = await Promise.all([fetchLibrary(), loadConfiguration()]);
    const overrides = overridesSchema.parse(config.overrides);
    if (!validatePriorityJudgments(config.judgments)) { throw new Error("Ongeldige config/readwise-priority-judgments.json"); }
    if (!validateCoreInterestPriorityConfig(config.coreInterestConfig)) { throw new Error("Ongeldige config/readwise-core-interest-priorities.json"); }
    return {
      plan: buildPriorityTagPlan(later, outside, {
        ...options, generatedAt: options.generatedAt ?? now(), overrides,
        judgments: config.judgments, coreInterestConfig: config.coreInterestConfig,
      }),
      documents: [...later, ...outside],
    };
  }

  async function plan(options: PrioritySyncOptions = {}): Promise<PriorityTagPlan> {
    return (await snapshot(options)).plan;
  }

  async function bulkEditTags(batch: readonly DocumentTagUpdate[]): Promise<DocumentBatchResult[]> {
    const payload = batch.map((update) => ({ document_id: update.documentId, tags: update.tags }));
    const { stdout } = await mutate(["reader-bulk-edit-document-metadata", "--documents", JSON.stringify(payload), "--json"]);
    const { results } = bulkResultSchema.parse(JSON.parse(stdout));
    return results.map((result) => ({
      documentId: result.id, success: result.success,
      message: typeof result.error === "string" ? result.error : result.error ? JSON.stringify(result.error) : undefined,
    }));
  }

  async function executeDocument(update: DocumentTagUpdate): Promise<void> {
    if (update.remove.length > 0) {
      await mutate(["reader-remove-tags-from-document", "--document-id", update.documentId, "--tag-names", update.remove.join(",")]);
    }
    if (update.add.length > 0) {
      await mutate(["reader-add-tags-to-document", "--document-id", update.documentId, "--tag-names", update.add.join(",")]);
    }
  }

  async function apply({ plan: candidate, confirmation, journalPath }: { plan: unknown; confirmation: string; journalPath: string }): Promise<PriorityJournal> {
    if (!validatePriorityTagPlan(candidate)) { throw new Error("Ongeldig prioriteitsplan"); }
    if (confirmation !== candidate.planHash) { throw new Error("Bevestigingshash komt niet overeen met het plan"); }
    // Capture the authorization before any asynchronous adapter can change its input object.
    const confirmed = structuredClone(candidate);
    const previous = await storage.read(journalPath);
    const parsed = previous === null || previous === undefined ? null : journalSchema.safeParse(previous);
    if (parsed && !parsed.success) { throw new Error("Ongeldig synchronisatiejournal; herstel het journal of kies een nieuw journalpad", { cause: parsed.error }); }
    const previousOrNew = parsed?.success && parsed.data.planHash === confirmed.planHash
      ? parsed.data
      : { planHash: confirmed.planHash, startedAt: now(), completed: [], failures: [] };
    const { bulkFailures, ...base } = previousOrNew;
    const journal: PriorityJournal = { ...base, ...(bulkFailures ? { bulkFailures } : {}) };
    delete journal.verified;
    delete journal.completedAt;
    await storage.write(journalPath, journal);

    async function authorizedSnapshot() {
      const current = await snapshot({ generatedAt: confirmed.generatedAt, cleanupAll: confirmed.scope === "all-locations" });
      if (current.plan.sourceFingerprint !== confirmed.sourceFingerprint) {
        throw new Error("Readwise of de score-invoer is gewijzigd; maak een nieuwe proefrun met priority:plan");
      }
      return current;
    }

    let current = await authorizedSnapshot();
    for (let round = 1; round <= 3; round++) {
      if (round > 1) {
        await delay(10_000);
        // Recheck after waiting: the previous verification is no longer a fresh mutation source.
        current = await authorizedSnapshot();
      }
      const pending = new Set(current.plan.operations.map(operationKey));
      journal.completed = journal.completed.filter((operation) => !pending.has(operationKey(operation)));
      const currentTags = new Map<string, string[]>();
      for (const doc of current.documents) {
        const tags = completeTagNames(doc);
        if (tags !== null) { currentTags.set(doc.id, tags); }
      }
      const updates = buildDocumentTagUpdates(current.plan.operations, currentTags);
      onEvent({ type: "round", round, operations: pending.size, documents: updates.length });
      const writeProgress = async (value: PriorityJournal) => {
        await storage.write(journalPath, value);
        const completed = new Set(value.completed.map(operationKey).filter((key) => pending.has(key))).size;
        onEvent({ type: "progress", round, completed, total: pending.size });
      };
      await writeProgress(journal);
      await applyPriorityDocumentUpdates({ updates, journal, executeBatch: bulkEditTags, executeDocument, writeJournal: writeProgress, delay });
      current = await authorizedSnapshot();
      if (current.plan.operations.length === 0) {
        const verified: PriorityJournal = { ...journal, completedAt: now(), verified: true };
        await storage.write(journalPath, verified);
        return verified;
      }
    }
    throw new Error(`Live verificatie vond nog ${String(current.plan.operations.length)} tagoperaties na drie rondes`);
  }

  async function verify(options: PrioritySyncOptions = {}): Promise<PriorityTagPlan> {
    const current = await plan(options);
    if (current.operations.length > 0) {
      throw new Error(`Readwise wijkt af: ${String(current.operations.length)} tagoperaties nodig. Draai priority:plan.`);
    }
    return current;
  }

  return { plan, apply, verify };
}
