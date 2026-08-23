import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

type SentMessage = { html: string; text: string };

function isSentMessage(value: unknown): value is SentMessage {
  return typeof value === "object" && value !== null
    && "html" in value && typeof value.html === "string"
    && "text" in value && typeof value.text === "string";
}

function runEmailScript(environment: NodeJS.ProcessEnv): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const childEnvironment = {
      PATH: process.env.PATH,
      RESEND_API_KEY: environment.RESEND_API_KEY,
      MAIL_FROM: environment.MAIL_FROM,
      RESEND_OUTPUT_FILE: environment.RESEND_OUTPUT_FILE,
    };
    const child = spawn(process.execPath, [
      "--import", new URL("./helpers/mock-resend.js", import.meta.url).href,
      "scripts/send-top1-email.js",
    ], { cwd: fileURLToPath(new URL("..", import.meta.url)), env: childEnvironment });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`E-mailscript stopte met code ${String(code)}: ${stderr}`));
      }
    });
  });
}

test("top-1 e-mail bevat alleen Readwise-links", async () => {
  const directory = await mkdtemp(join(tmpdir(), "top-articles-email-"));
  const output = join(directory, "resend-request.json");
  try {
    await runEmailScript({
      ...process.env,
      RESEND_API_KEY: "test-key",
      MAIL_FROM: "test@example.com",
      RESEND_OUTPUT_FILE: output,
    });

    const message: unknown = JSON.parse(await readFile(output, "utf8"));
    assert.ok(isSentMessage(message), "Resend-verzoek heeft geen geldige berichtinhoud");
    const urls = [...message.html.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? "");
    assert.ok(urls.length > 0, "de e-mail bevat geen artikellinks");
    assert.ok(urls.every((url) => url.startsWith("https://read.readwise.io/read/")), urls.join("\n"));
    assert.match(message.text, /https:\/\/read\.readwise\.io\/read\//);
    assert.doesNotMatch(message.text, /mailto:|berthub\.eu|era\.ed\.ac\.uk/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
