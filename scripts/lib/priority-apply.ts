export interface PriorityOperation { action: "add" | "remove"; documentId: string; tag: string; }
export interface PriorityFailure extends PriorityOperation { attempt: number; at: string; message: string; }
export interface PriorityJournal { completed: PriorityOperation[]; failures?: PriorityFailure[]; [key: string]: unknown; }

function sameOperation(left: PriorityOperation, right: PriorityOperation): boolean {
  return left.action === right.action && left.documentId === right.documentId && left.tag === right.tag;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function applyPriorityOperations({
  operations,
  journal,
  execute,
  writeJournal,
  delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  retries = 3,
}: {
  operations: PriorityOperation[];
  journal: PriorityJournal;
  execute: (operation: PriorityOperation) => Promise<void>;
  writeJournal: (journal: PriorityJournal) => Promise<void>;
  delay?: (milliseconds: number) => Promise<void>;
  retries?: number;
}): Promise<PriorityJournal> {
  if (!Array.isArray(operations)) {
    throw new TypeError("applyPriorityOperations vereist operaties");
  }
  if (!Array.isArray(journal.completed)) {
    throw new TypeError("applyPriorityOperations vereist een journal met completed");
  }
  if (typeof execute !== "function" || typeof writeJournal !== "function") {
    throw new TypeError("applyPriorityOperations vereist execute en writeJournal");
  }
  const failures = journal.failures ?? [];
  journal.failures = failures;

  for (const operation of operations) {
    if (journal.completed.some((completed: PriorityOperation) => sameOperation(completed, operation))) {continue;}

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        await execute(operation);
        journal.completed.push(operation);
        await writeJournal(journal);
        break;
      } catch (error) {
        failures.push({
          ...operation,
          attempt,
          at: new Date().toISOString(),
          message: errorMessage(error),
        });
        await writeJournal(journal);
        if (attempt > retries) {
          throw new Error(
            `Mislukte tagoperatie na ${String(attempt)} pogingen: ${operation.action} ${operation.tag} op ${operation.documentId}: ${errorMessage(error)}`,
            { cause: error },
          );
        }
        await delay(1_000 * (2 ** (attempt - 1)));
      }
    }
  }

  return journal;
}
