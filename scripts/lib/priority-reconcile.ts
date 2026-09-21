export interface PriorityReconcileSnapshot {
  operations: readonly unknown[];
}

export interface PriorityReconcileOptions<TSnapshot extends PriorityReconcileSnapshot> {
  initial: TSnapshot;
  apply: (snapshot: TSnapshot, attempt: number) => Promise<void>;
  verify: () => Promise<TSnapshot>;
  delay?: (milliseconds: number) => Promise<void>;
  delayMilliseconds?: number;
  maxAttempts?: number;
}

export async function reconcilePrioritySync<TSnapshot extends PriorityReconcileSnapshot>({
  initial,
  apply,
  verify,
  delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  delayMilliseconds = 10_000,
  maxAttempts = 3,
}: PriorityReconcileOptions<TSnapshot>): Promise<TSnapshot> {
  let snapshot = initial;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await delay(delayMilliseconds);
    }
    await apply(snapshot, attempt);
    snapshot = await verify();
    if (snapshot.operations.length === 0) {
      return snapshot;
    }
  }
  return snapshot;
}
