function sameOperation(left, right) {
  return left.action === right.action && left.documentId === right.documentId && left.tag === right.tag;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function applyPriorityOperations({
  operations,
  journal,
  execute,
  writeJournal,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  retries = 3,
} = {}) {
  if (!Array.isArray(operations)) throw new TypeError("applyPriorityOperations vereist operaties");
  if (!journal || !Array.isArray(journal.completed)) throw new TypeError("applyPriorityOperations vereist een journal met completed");
  if (typeof execute !== "function" || typeof writeJournal !== "function") throw new TypeError("applyPriorityOperations vereist execute en writeJournal");
  journal.failures ??= [];

  for (const operation of operations) {
    if (journal.completed.some((completed) => sameOperation(completed, operation))) continue;

    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        await execute(operation);
        journal.completed.push(operation);
        await writeJournal(journal);
        break;
      } catch (error) {
        journal.failures.push({
          ...operation,
          attempt,
          at: new Date().toISOString(),
          message: errorMessage(error),
        });
        await writeJournal(journal);
        if (attempt > retries) {
          throw new Error(`Mislukte tagoperatie na ${attempt} pogingen: ${operation.action} ${operation.tag} op ${operation.documentId}: ${errorMessage(error)}`);
        }
        await delay(1_000 * (2 ** (attempt - 1)));
      }
    }
  }

  return journal;
}
