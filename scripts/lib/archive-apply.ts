import { assertArchivePlanFresh, type ArchivePlan } from "./archive-plan.js";
import type { PriorityDocument } from "./readwise-priority-v2.js";
import type { PriorityJudgmentsConfig, PriorityOverridesConfig } from "./readwise-priority-v6.js";
import type { ContentJudgment } from "./priority-judgments.js";

export const ARCHIVE_BATCH_SIZE = 50;

export interface ArchiveMoveResult {
  documentId: string;
  success: boolean;
  message?: string | undefined;
}

export interface ArchiveFailure {
  documentId: string;
  attempt: number;
  at: string;
  message: string;
}

export interface ArchiveJournal {
  planHash: string;
  startedAt: string;
  completed: string[];
  failures: ArchiveFailure[];
  completedAt?: string | undefined;
  verified?: boolean | undefined;
}

export type MoveArchiveBatch = (documentIds: readonly string[]) => Promise<readonly ArchiveMoveResult[]>;
export type WriteArchiveJournal = (journal: ArchiveJournal) => Promise<void>;
export type ArchiveDelay = (milliseconds: number) => Promise<void>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertBatchResults(ids: readonly string[], results: readonly ArchiveMoveResult[]): void {
  const expected = new Set(ids);
  const actual = new Set(results.map(({ documentId }) => documentId));
  if (actual.size !== results.length || actual.size !== expected.size || [...expected].some((id) => !actual.has(id))) {
    throw new Error("Readwise gaf geen volledige unieke batchrespons terug");
  }
}

export async function applyArchivePlan({
  plan,
  currentDocuments,
  overrides,
  judgments,
  journal,
  moveDocuments,
  writeJournal,
  batchSize = ARCHIVE_BATCH_SIZE,
  retries = 3,
  delay = (milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  now = () => new Date().toISOString(),
}: {
  plan: ArchivePlan;
  currentDocuments: readonly PriorityDocument[];
  overrides: PriorityOverridesConfig;
  judgments?: PriorityJudgmentsConfig | Record<string, ContentJudgment>;
  journal: ArchiveJournal;
  moveDocuments: MoveArchiveBatch;
  writeJournal: WriteArchiveJournal;
  batchSize?: number;
  retries?: number;
  delay?: ArchiveDelay;
  now?: () => string;
}): Promise<ArchiveJournal> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > ARCHIVE_BATCH_SIZE) {
    throw new TypeError(`Archivebatchgrootte moet tussen 1 en ${String(ARCHIVE_BATCH_SIZE)} liggen`);
  }
  if (!Number.isInteger(retries) || retries < 0) {
    throw new TypeError("Archive-retries moeten een niet-negatief geheel getal zijn");
  }
  if (journal.planHash !== plan.planHash) {
    throw new Error("Archivejournal hoort niet bij dit plan");
  }
  const candidateIds = new Set(plan.candidateDocumentIds);
  if (journal.completed.some((id) => !candidateIds.has(id))) {
    throw new Error("Archivejournal bevat een document dat niet in het plan staat");
  }
  assertArchivePlanFresh(plan, currentDocuments, overrides, judgments);

  const completed = new Set(journal.completed);
  const pending = plan.candidateDocumentIds.filter((id) => !completed.has(id));
  await writeJournal(journal);

  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    let results: readonly ArchiveMoveResult[] | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        results = await moveDocuments(batch);
        break;
      } catch (error: unknown) {
        lastError = error;
        journal.failures.push({
          documentId: batch[0] ?? "(lege batch)",
          attempt: attempt + 1,
          at: now(),
          message: errorMessage(error),
        });
        await writeJournal(journal);
        if (attempt < retries) {
          await delay(1_000 * (2 ** attempt));
        }
      }
    }
    if (!results) {
      throw new Error(`Archiveren mislukt na ${String(retries + 1)} pogingen: ${errorMessage(lastError)}`);
    }
    try {
      assertBatchResults(batch, results);
    } catch (error: unknown) {
      journal.failures.push({
        documentId: batch[0] ?? "(lege batch)",
        attempt: 1,
        at: now(),
        message: errorMessage(error),
      });
      await writeJournal(journal);
      throw error;
    }
    const failed = results.filter((result) => !result.success);
    if (failed.length > 0) {
      for (const result of results.filter((entry) => entry.success)) {
        if (!completed.has(result.documentId)) {
          completed.add(result.documentId);
          journal.completed.push(result.documentId);
        }
      }
      for (const result of failed) {
        journal.failures.push({
          documentId: result.documentId,
          attempt: 1,
          at: now(),
          message: result.message ?? "Readwise weigerde het archiveren",
        });
      }
      await writeJournal(journal);
      throw new Error(`Readwise weigerde ${String(failed.length)} archiefverplaatsing(en)`);
    }
    for (const id of batch) {
      completed.add(id);
      journal.completed.push(id);
    }
    await writeJournal(journal);
  }

  journal.completedAt = now();
  await writeJournal(journal);
  return journal;
}
