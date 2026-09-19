#!/usr/bin/env node
// Verstuurt om 08:00 Nederlandse tijd een willekeurig kort artikel uit een
// willekeurig gekozen kerninteresse.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

import { buildCoreInterestEmail, CORE_INTEREST_LABELS, coreInterestRandomFor, selectCoreInterestArticle, shouldSendCoreInterestEmail } from "./lib/core-interest-email.js";
import type { CoreInterestCandidate, CoreInterestPriorityWeights } from "./lib/core-interest-email.js";
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
const coreInterestPrioritySchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  order: z.array(directDomainSchema),
  weights: z.record(z.string(), z.number()),
  entries: z.array(z.object({
    interest: directDomainSchema,
    label: z.string(),
    rank: z.number().int(),
    weight: z.number().int().positive(),
    source: z.enum(["manual", "derived"]),
    evidenceDocumentCount: z.number().int().nonnegative(),
    evidenceScore: z.number().int(),
  })),
});
const prioritySchema = z.object({
  generatedAt: z.string(),
  model: z.literal("readwise-priority-v7"),
  scope: z.literal("later"),
  coreInterestPriority: coreInterestPrioritySchema,
  items: z.record(z.string(), z.object({
    score: z.number(),
    actualPositions: z.record(z.string(), z.number()),
    coreInterestMatches: z.array(z.object({
      interest: directDomainSchema,
      weight: z.number().int().positive(),
      qualityScore: z.number(),
      evidence: z.array(z.object({
        kind: z.enum(["readwise-tag", "semantic-signal"]),
        source: z.string().min(1),
        label: z.string().min(1),
      })),
    })),
  })),
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
  const coreInterestPriority: CoreInterestPriorityWeights = {
    order: priority.coreInterestPriority.order,
    weights: priority.coreInterestPriority.weights,
  };
  const candidates: CoreInterestCandidate[] = data.catalog.items.flatMap((article) => {
    const itemPriority = priority.items[article.id];
    const score = itemPriority?.score;
    if (article.readwiseUrl === null || itemPriority === undefined || score === undefined) {
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
        coreInterests: itemPriority.coreInterestMatches.map(({ interest }) => interest),
      },
      priority: {
        score,
        actualPositions: itemPriority.actualPositions,
      },
    }];
  });
  const selected = selectCoreInterestArticle(candidates, coreInterestRandomFor(now), coreInterestPriority);
  if (!selected) {
    console.log("Geen geschikt kerninteresse-artikel gevonden — geen mail verstuurd.");
    return;
  }

  const email = buildCoreInterestEmail(selected, dateLabel(now));
  await sendEmail(email);
  console.log(`Mail verstuurd: ${CORE_INTEREST_LABELS[selected.interest]} · ${selected.tag} — ${selected.article.title}`);
}

main().catch((error: unknown) => {
  console.error("Versturen mislukt:", error);
  process.exit(1);
});
