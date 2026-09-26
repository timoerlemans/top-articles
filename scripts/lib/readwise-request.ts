export type Delay = (milliseconds: number) => Promise<void>;
export type ReadwiseExecutor<T> = (args: readonly string[]) => Promise<T>;

const wait: Delay = (milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

function withStderrDetails(error: unknown): unknown {
  if (!error || typeof error !== "object") {return error;}

  const stderr = (error as { stderr?: unknown }).stderr;
  const exitCode = (error as { code?: unknown }).code;
  const rawStderr = typeof stderr === "string" ? stderr : "";
  if (rawStderr.trim().length === 0) {
    if (typeof exitCode !== "number") {return error;}
    const message = error instanceof Error ? error.message : String(error);
    return new Error(
      `${message}\nReadwise CLI exited with code ${String(exitCode)} without stderr. Check DNS and outbound HTTPS access to the Readwise MCP service (mcp2.readwise.io).`,
      { cause: error },
    );
  }

  const safeStderr = rawStderr
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(/(authorization\s*[:=]\s*(?:bearer|token)\s+)[^\s,;]+/gi, "$1<REDACTED>")
    .replace(/\b(access_token|refresh_token)(\s*[:=]\s*)["']?[^"',;\s]+/gi, "$1$2<REDACTED>")
    .trim();
  const message = error instanceof Error ? error.message : String(error);
  const networkHint = /fetch failed|could not fetch tools|eai_again/i.test(safeStderr)
    ? "\nCheck DNS and outbound HTTPS access to the Readwise MCP service (mcp2.readwise.io)."
    : "";

  return new Error(`${message}\nReadwise CLI stderr: ${safeStderr}${networkHint}`, { cause: error });
}

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
  throw withStderrDetails(lastError);
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
