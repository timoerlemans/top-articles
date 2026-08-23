#!/usr/bin/env node
// Verstuurt de dagelijkse "top-1 per tagreeks"-mail via Resend.
// Leest data/data.js (gegenereerd door build-data.ts) en pakt per familie
// (= tagreeks) het eerste item uit de top-10-lijst.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";

import { resendEmailResponseSchema } from "./lib/external-schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(resolve(__dirname, "../.."), "data", "data.js");
const MAIL_TO = "top1articletoday@t10s.nl";

const topArticleSchema = z.object({
  title: z.string(),
  readwiseUrl: z.url(),
  whyRead: z.string().nullable(),
});
const topArticlesSchema = z.object({
  generatedAt: z.iso.datetime(),
  families: z.array(z.object({
    label: z.string(),
    lists: z.object({ "top-10": z.object({ items: z.array(topArticleSchema) }) }),
  })),
});
type TopArticle = z.infer<typeof topArticleSchema>;
type TopFamily = z.infer<typeof topArticlesSchema>["families"][number];
type TopSection = { family: TopFamily; top: TopArticle };

async function loadTopArticles(): Promise<z.infer<typeof topArticlesSchema>> {
  const raw = await readFile(DATA_FILE, "utf8");
  const match = raw.match(/window\.TOP_ARTICLES\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!match) {
    throw new Error(`Kon window.TOP_ARTICLES niet vinden in ${DATA_FILE}`);
  }
  const json = match[1];
  if (!json) {
    throw new Error(`Kon window.TOP_ARTICLES niet lezen uit ${DATA_FILE}`);
  }
  return topArticlesSchema.parse(JSON.parse(json));
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return character;
    }
  });
}

function buildSections(families: TopFamily[]): TopSection[] {
  return families
    .map((family) => ({ family, top: family.lists["top-10"].items[0] ?? null }))
    .filter((section): section is TopSection => section.top !== null);
}

function buildHtml(sections: TopSection[], dateLabel: string): string {
  const rows = sections
    .map(({ family, top }) => `
      <tr>
        <td style="padding: 12px 0; border-bottom: 1px solid #e5e5e5;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #888;">${escapeHtml(family.label)}</div>
          <div style="font-size: 16px; margin: 4px 0;">
            <a href="${escapeHtml(top.readwiseUrl)}" style="color: #111; text-decoration: none;">${escapeHtml(top.title)}</a>
          </div>
          ${top.whyRead ? `<div style="font-size: 13px; color: #555;">${escapeHtml(top.whyRead)}</div>` : ""}
        </td>
      </tr>`)
    .join("");
  return `<!doctype html>
<html><body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="font-size: 20px;">Je top-1 artikelen van vandaag</h1>
  <p style="color: #888; font-size: 13px;">${escapeHtml(dateLabel)}</p>
  <table style="width: 100%; border-collapse: collapse;">${rows}</table>
</body></html>`;
}

function buildText(sections: TopSection[], dateLabel: string): string {
  const lines = sections.map(({ family, top }) =>
    `${family.label}: ${top.title}\n${top.readwiseUrl}${top.whyRead ? `\n${top.whyRead}` : ""}`
  );
  return `Je top-1 artikelen van vandaag (${dateLabel})\n\n${lines.join("\n\n")}\n`;
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

async function main() {
  const data = await loadTopArticles();
  const sections = buildSections(data.families);
  if (sections.length === 0) {
    console.log("Geen enkele reeks heeft een top-1 artikel — geen mail verstuurd.");
    return;
  }

  const dateLabel = new Date(data.generatedAt).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const subject = `Je top-1 artikelen van vandaag — ${dateLabel}`;

  await sendEmail({
    subject,
    html: buildHtml(sections, dateLabel),
    text: buildText(sections, dateLabel),
  });
  console.log(`Mail verstuurd naar ${MAIL_TO} met ${String(sections.length)} secties.`);
}

main().catch((error: unknown) => {
  console.error("Versturen mislukt:", error);
  process.exit(1);
});
