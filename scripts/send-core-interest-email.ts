#!/usr/bin/env node
// Verstuurt om 08:00 Nederlandse tijd een willekeurig kort artikel uit een
// willekeurig gekozen kerninteresse.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

import { amsterdamDateKey, buildCoreInterestEmail, CORE_INTEREST_LABELS, dailyRandomFor, selectCoreInterestArticle, shouldSendCoreInterestEmail } from "./lib/core-interest-email.js";
import type { CoreInterestCandidate } from "./lib/core-interest-email.js";
import { DIRECT_DOMAIN_TAGS } from "./lib/readwise-priority-v2.js";
import type { DirectDomain } from "./lib/readwise-priority-v2.js";
import { resendEmailResponseSchema } from "./lib/external-schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const DATA_FILE = join(ROOT, "data", "data.js");
const PRIORITY_FILE = join(ROOT, "data", "score.js");
const MAIL_TO = "top1articletoday@t10s.nl";
const TIME_ZONE = "Europe/Amsterdam";

const directDomainSchema = z.enum(Object.keys(DIRECT_DOMAIN_TAGS) as [DirectDomain, ...DirectDomain[]]);
const articleSchema = z.object({
  id: z.string(),
  title: z.string(),
  readwiseUrl: z.url().nullable(),
  whyRead: z.string().nullable(),
  readingMinutes: z.number().nullable(),
  savedDate: z.string().nullable(),
  coreInterests: z.array(directDomainSchema),
});
const dataSchema = z.object({
  generatedAt: z.iso.datetime(),
  catalog: z.object({ items: z.array(articleSchema) }),
});
const prioritySchema = z.object({
  items: z.record(z.string(), z.object({ score: z.number() })),
});

async function loadGenerated<T>(path: string, globalName: string, schema: z.ZodType<T>): Promise<T> {
  const raw = await readFile(path, "utf8");
  const match = raw.match(new RegExp(`${globalName}\\s*=\\s*(\\{[\\s\\S]*\\});?\\s*$`));
  if (!match?.[1]) {
    throw new Error(`Kon ${globalName} niet vinden in ${path}`);
  }
  return schema.parse(JSON.parse(match[1]));
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

async function sendEmail({ subject, html, text }: { subject: string; html: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY ontbreekt");
  }
  if (!from) {
    throw new Error("MAIL_FROM ontbreekt");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: MAIL_TO, subject, html, text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend gaf ${String(response.status)}: ${body}`);
  }
  resendEmailResponseSchema.parse(await response.json());
}

async function main(): Promise<void> {
  const now = new Date();
  const forceSend = process.env.FORCE_SEND === "true";
  if (!shouldSendCoreInterestEmail(now, forceSend)) {
    console.log("Niet verstuurd: het is niet 08:00 in Europe/Amsterdam.");
    return;
  }

  const [data, priority] = await Promise.all([
    loadGenerated(DATA_FILE, "window.TOP_ARTICLES", dataSchema),
    loadGenerated(PRIORITY_FILE, "window.TOP_ARTICLE_PRIORITY", prioritySchema),
  ]);
  const candidates: CoreInterestCandidate[] = data.catalog.items.flatMap((article) => {
    const score = priority.items[article.id]?.score;
    if (article.readwiseUrl === null || score === undefined) {
      return [];
    }
    return [{
      article: {
        id: article.id,
        title: article.title,
        readwiseUrl: article.readwiseUrl,
        whyRead: article.whyRead,
        readingMinutes: article.readingMinutes,
        savedDate: article.savedDate,
        coreInterests: article.coreInterests,
      },
      priority: { score },
    }];
  });
  const selected = selectCoreInterestArticle(candidates, dailyRandomFor(amsterdamDateKey(now)));
  if (!selected) {
    console.log("Geen geschikt kerninteresse-artikel gevonden — geen mail verstuurd.");
    return;
  }

  const email = buildCoreInterestEmail(selected, dateLabel(now));
  await sendEmail(email);
  console.log(`Mail verstuurd: ${CORE_INTEREST_LABELS[selected.interest]} #${String(selected.rank)} — ${selected.article.title}`);
}

main().catch((error: unknown) => {
  console.error("Versturen mislukt:", error);
  process.exit(1);
});
