import type { PriorityOperation } from "./priority-apply.js";

/** Maximaal aantal documenten per `reader-bulk-edit-document-metadata`-call. */
export const BULK_EDIT_BATCH_SIZE = 50;

export interface DocumentTagUpdate {
  documentId: string;
  add: string[];
  remove: string[];
  /**
   * Volledige eindtagset voor het document, inclusief niet-beheerde tags — de bulk-endpoint
   * vervangt álle tags. `null` als de huidige tags onbekend zijn; zo'n document gaat nooit
   * via de bulkroute, maar altijd via losse add/remove-calls.
   */
  tags: string[] | null;
}

function dedupe(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/**
 * Groepeert losse tagoperaties per document en berekent de eindtagset op basis van de tags
 * die Readwise op dat moment teruggeeft.
 */
export function buildDocumentTagUpdates(
  operations: readonly PriorityOperation[],
  currentTagsByDocument: ReadonlyMap<string, readonly string[]>,
): DocumentTagUpdate[] {
  const grouped = new Map<string, { add: string[]; remove: string[] }>();
  for (const operation of operations) {
    let entry = grouped.get(operation.documentId);
    if (!entry) {
      entry = { add: [], remove: [] };
      grouped.set(operation.documentId, entry);
    }
    entry[operation.action].push(operation.tag);
  }

  return [...grouped].map(([documentId, { add, remove }]) => {
    const current = currentTagsByDocument.get(documentId);
    const removed = new Set(remove.map((tag) => tag.toLowerCase()));
    const tags = current === undefined
      ? null
      : dedupe([...current.filter((tag) => !removed.has(tag.toLowerCase())), ...add]);
    return { documentId, add, remove, tags };
  });
}

export function chunkDocumentUpdates(
  updates: readonly DocumentTagUpdate[],
  size: number = BULK_EDIT_BATCH_SIZE,
): DocumentTagUpdate[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new TypeError("chunkDocumentUpdates vereist een positieve batchgrootte");
  }
  const batches: DocumentTagUpdate[][] = [];
  for (let index = 0; index < updates.length; index += size) {
    batches.push(updates.slice(index, index + size));
  }
  return batches;
}

export function documentUpdateOperations(update: DocumentTagUpdate): PriorityOperation[] {
  return [
    ...update.remove.map((tag) => ({ action: "remove" as const, documentId: update.documentId, tag })),
    ...update.add.map((tag) => ({ action: "add" as const, documentId: update.documentId, tag })),
  ];
}
