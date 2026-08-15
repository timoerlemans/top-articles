const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function executeReadwise(args, { exec, delay = wait, retries = 3 } = {}) {
  if (typeof exec !== "function") throw new TypeError("executeReadwise vereist een exec-functie");

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await exec(args);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await delay(1_000 * (attempt + 1));
    }
  }
  throw lastError;
}

export function createReadwiseRequester({
  exec,
  delay = wait,
  now = Date.now,
  minInterval = 3_100,
  retries = 3,
} = {}) {
  let nextAllowedAt = 0;
  let tail = Promise.resolve();

  async function pacedExec(args) {
    const previous = tail;
    let release;
    tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const remaining = Math.max(0, nextAllowedAt - now());
      if (remaining > 0) await delay(remaining);
      nextAllowedAt = now() + minInterval;
      return await exec(args);
    } finally {
      release();
    }
  }

  return (args) => executeReadwise(args, { exec: pacedExec, delay, retries });
}
