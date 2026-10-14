export interface ReviewedConfigPublication {
  readonly name: string;
  readonly baseline: unknown;
  readonly remote: unknown;
  readonly proposed: unknown;
  readonly producedIds: readonly string[];
  readonly producedTopLevelKeys?: readonly string[];
  readonly validate: (value: unknown) => boolean;
}

export interface ReviewedConfigPublicationResult {
  readonly value: Record<string, unknown>;
  readonly changedIds: readonly string[];
  readonly conflicts: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function itemsOf(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.items)) {
    throw new Error(`${name} config mist een object met items`);
  }
  return value.items;
}

/**
 * Merge only objects produced by one review run into the current remote config.
 * The run-start baseline is the concurrency boundary: unrelated remote edits
 * survive, while same-ID edits fail closed instead of being overwritten.
 */
export function mergeReviewedConfig(input: ReviewedConfigPublication): ReviewedConfigPublicationResult {
  if (!input.validate(input.baseline) || !input.validate(input.remote) || !input.validate(input.proposed)) {
    throw new Error(`${input.name}: baseline, remote en proposed config moeten gevalideerd zijn`);
  }
  const baseline = input.baseline as Record<string, unknown>;
  const remote = input.remote as Record<string, unknown>;
  const proposed = input.proposed as Record<string, unknown>;
  const baselineItems = itemsOf(input.baseline, input.name);
  const remoteItems = itemsOf(input.remote, input.name);
  const proposedItems = itemsOf(input.proposed, input.name);
  const producedIds = [...new Set(input.producedIds)];
  if (producedIds.length !== input.producedIds.length || producedIds.some((id) => !id || !Object.hasOwn(proposedItems, id))) {
    throw new Error(`${input.name}: proposed config bevat niet alle run-geproduceerde IDs`);
  }

  const conflicts: string[] = [];
  const merged = structuredClone(remote);
  const mergedItems = itemsOf(merged, input.name);
  const changedIds: string[] = [];
  for (const id of producedIds) {
    const before = baselineItems[id];
    const current = remoteItems[id];
    const next = proposedItems[id];
    const remoteChanged = !same(current, before);
    const runChanged = !same(next, before);
    if (remoteChanged && runChanged && !same(current, next)) {
      conflicts.push(`${input.name}.items.${id}`);
      continue;
    }
    if (runChanged && !same(current, next)) {
      mergedItems[id] = structuredClone(next);
      changedIds.push(id);
    }
  }

  for (const key of input.producedTopLevelKeys ?? []) {
    const before = baseline[key];
    const current = remote[key];
    const next = proposed[key];
    if (same(current, before) || same(next, before) || same(current, next)) {
      if (!same(next, before) && !same(current, next)) { merged[key] = structuredClone(next); }
      continue;
    }
    conflicts.push(`${input.name}.${key}`);
  }
  if (conflicts.length > 0) {
    throw new Error(`${input.name}: gelijktijdige wijzigingen in ${conflicts.join(", ")}`);
  }
  if (!input.validate(merged)) {
    throw new Error(`${input.name}: samengevoegde config is ongeldig`);
  }
  return { value: merged, changedIds, conflicts };
}
