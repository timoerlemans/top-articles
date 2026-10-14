import { createHash } from "node:crypto";

import { completeReaderTagSet } from "./reader-tag-set.js";
import type { PriorityTagDocument, PriorityTagOperation } from "./priority-tag-plan.js";
import { PREFERRED_AUTHOR_WANT_TO_READ_TAG, preferredAuthorFor } from "./preferred-authors.js";

export const PREFERRED_AUTHOR_PLAN_MODEL = "readwise-preferred-author-tag-plan-v1" as const;

export interface PreferredAuthorTagChange {
  title: string;
  author: string;
  add: [typeof PREFERRED_AUTHOR_WANT_TO_READ_TAG];
}

export interface PreferredAuthorTagPlan {
  generatedAt: string;
  model: typeof PREFERRED_AUTHOR_PLAN_MODEL;
  scope: "later";
  sourceFingerprint: string;
  summary: {
    documents: number;
    preferredAuthors: number;
    additions: number;
    alreadyTagged: number;
    incomplete: number;
  };
  changes: Record<string, PreferredAuthorTagChange>;
  operations: PriorityTagOperation[];
  planHash: string;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedTags(doc: PriorityTagDocument): string[] | null {
  const tags = completeReaderTagSet(doc.tags);
  return tags === null ? null : tags.map((tag) => tag.toLowerCase()).sort();
}

function sourceDocuments(documents: readonly PriorityTagDocument[]): Record<string, unknown>[] {
  return [...documents]
    .filter((doc) => doc.location === undefined || doc.location === null || doc.location === "later")
    .map((doc) => ({ id: doc.id, author: doc.author ?? null, tags: normalizedTags(doc) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function buildPreferredAuthorTagPlan(
  documents: readonly PriorityTagDocument[],
  options: { generatedAt?: string } = {},
): PreferredAuthorTagPlan {
  const later = documents.filter((doc) => doc.location === undefined || doc.location === null || doc.location === "later");
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const changes: Record<string, PreferredAuthorTagChange> = {};
  const operations: PriorityTagOperation[] = [];
  let preferredAuthors = 0;
  let alreadyTagged = 0;
  let incomplete = 0;

  for (const doc of later) {
    if (!preferredAuthorFor(doc)) { continue; }
    preferredAuthors += 1;
    const tags = completeReaderTagSet(doc.tags);
    if (tags === null) {
      incomplete += 1;
      continue;
    }
    if (tags.some((tag) => tag.toLowerCase() === PREFERRED_AUTHOR_WANT_TO_READ_TAG)) {
      alreadyTagged += 1;
      continue;
    }
    changes[doc.id] = {
      title: doc.title ?? "(zonder titel)",
      author: doc.author ?? "(onbekende auteur)",
      add: [PREFERRED_AUTHOR_WANT_TO_READ_TAG],
    };
    operations.push({ action: "add", documentId: doc.id, tag: PREFERRED_AUTHOR_WANT_TO_READ_TAG });
  }

  const body: Omit<PreferredAuthorTagPlan, "planHash"> = {
    generatedAt,
    model: PREFERRED_AUTHOR_PLAN_MODEL,
    scope: "later",
    sourceFingerprint: hash({ scope: "later", documents: sourceDocuments(later) }),
    summary: {
      documents: later.length,
      preferredAuthors,
      additions: operations.length,
      alreadyTagged,
      incomplete,
    },
    changes,
    operations,
  };
  const plan: PreferredAuthorTagPlan = { ...body, planHash: hash(body) };
  validatePreferredAuthorTagPlan(plan);
  return plan;
}

export function validatePreferredAuthorTagPlan(value: unknown): value is PreferredAuthorTagPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) { throw new Error("Ongeldig auteurstagplan"); }
  const plan = value as Record<string, unknown>;
  if (plan.model !== PREFERRED_AUTHOR_PLAN_MODEL || plan.scope !== "later" || typeof plan.generatedAt !== "string" || typeof plan.sourceFingerprint !== "string") {
    throw new Error("Ongeldig auteurstagplanmodel");
  }
  const { planHash, ...body } = plan;
  if (typeof planHash !== "string" || hash(body) !== planHash) { throw new Error("Auteurstagplanhash komt niet overeen met de inhoud"); }
  if (!Array.isArray(plan.operations) || !plan.operations.every((operation) => {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) { return false; }
    const entry = operation as Record<string, unknown>;
    return entry.action === "add" && typeof entry.documentId === "string" && entry.tag === PREFERRED_AUTHOR_WANT_TO_READ_TAG;
  })) { throw new Error("Ongeldige auteurstagoperatie"); }
  if (!plan.changes || typeof plan.changes !== "object" || Array.isArray(plan.changes)) { throw new Error("Auteurstagplan mist wijzigingen"); }
  const summary = plan.summary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) { throw new Error("Auteurstagplan mist samenvatting"); }
  const values = summary as Record<string, unknown>;
  for (const key of ["documents", "preferredAuthors", "additions", "alreadyTagged", "incomplete"]) {
    if (!Number.isInteger(values[key]) || (values[key] as number) < 0) { throw new Error("Ongeldige auteurstagsamenvatting"); }
  }
  if (values.additions !== plan.operations.length || values.additions !== Object.keys(plan.changes).length) {
    throw new Error("Auteurstagsamenvatting klopt niet");
  }
  return true;
}

export function assertPreferredAuthorTagPlanFresh(
  plan: PreferredAuthorTagPlan,
  currentDocuments: readonly PriorityTagDocument[],
): true {
  validatePreferredAuthorTagPlan(plan);
  const fresh = buildPreferredAuthorTagPlan(currentDocuments, { generatedAt: plan.generatedAt });
  if (fresh.sourceFingerprint !== plan.sourceFingerprint || fresh.planHash !== plan.planHash) {
    throw new Error("Auteurstagbron is gewijzigd; maak een nieuw auteurstagplan");
  }
  return true;
}
