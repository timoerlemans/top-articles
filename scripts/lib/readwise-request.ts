export type Delay = (milliseconds: number) => Promise<void>;
export type ReadwiseExecutor<T> = (args: readonly string[]) => Promise<T>;

const wait: Delay = (milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function executeReadwise<T>(
  args: readonly string[],
  { exec, delay = wait, retries = 3 }: { exec: ReadwiseExecutor<T>; delay?: Delay; retries?: number },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await exec(args);
    } catch (error: unknown) {
      lastError = error;
      if (attempt < retries) {
        await delay(1_000 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

export function createReadwiseRequester<T>({
  exec,
  delay = wait,
  now = Date.now,
  minInterval = 3_100,
  retries = 3,
}: { exec: ReadwiseExecutor<T>; delay?: Delay; now?: () => number; minInterval?: number; retries?: number }): ReadwiseExecutor<T> {
  let nextAllowedAt = 0;
  let tail: Promise<void> = Promise.resolve();

  async function pacedExec(args: readonly string[]): Promise<T> {
    const previous = tail;
    let release: (() => void) | undefined;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const remaining = Math.max(0, nextAllowedAt - now());
      if (remaining > 0) {
        await delay(remaining);
      }
      nextAllowedAt = now() + minInterval;
      return await exec(args);
    } finally {
      release?.();
    }
  }

  return (args) => executeReadwise(args, { exec: pacedExec, delay, retries });
}
