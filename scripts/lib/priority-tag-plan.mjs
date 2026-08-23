import { createHash } from "node:crypto";

import { buildPriorityExport, SEQUENCE_ORDER } from "./readwise-priority-v3.mjs";
import { FAMILY_DEFINITIONS } from "./unified-lists.mjs";

export const TAG_PLAN_MODEL = "readwise-priority-tag-plan-v1";

const TOPLIST_TAGS = new Set(FAMILY_DEFINITIONS.flatMap(({ top10Tag, top100Tag }) => [top10Tag, top100Tag]));
const ORDINAL_PATTERNS = new Map(SEQUENCE_ORDER.map((sequence) => [
  sequence,
  sequence === "lees" ? new RegExp(`^${sequence}-[0-9]{4}$`) : new RegExp(`^${sequence}-[0-9]{3,4}$`),
]));

function tagKeys(doc) {
  if (!doc?.tags) return [];
  return (Array.isArray(doc.tags) ? doc.tags : Object.keys(doc.tags))
    .map((tag) => typeof tag === "string" ? tag : tag?.name ?? tag?.key ?? "")
    .map((tag) => tag.toLowerCase().trim())
    .filter(Boolean);
}

export function isManagedOrderTag(tag) {
  return TOPLIST_TAGS.has(tag) || [...ORDINAL_PATTERNS.values()].some((pattern) => pattern.test(tag));
}

function ordinalTag(sequence, position) {
  return `${sequence}-${String(position).padStart(sequence === "lees" ? 4 : 3, "0")}`;
}

function stableSource(documents) {
  return [...documents]
    .map((doc) => ({
      id: doc.id,
      location: doc.location ?? null,
      saved_at: doc.saved_at ?? null,
      category: doc.category ?? null,
      title: doc.title ?? null,
      summary: doc.summary ?? null,
      notes: doc.notes ?? null,
      word_count: doc.word_count ?? null,
      reading_time: doc.reading_time ?? null,
      language: doc.language ?? null,
      lightMembership: tagKeys(doc).some((tag) => tag === "light-reading" || /^luchtig-\d{3,4}$/.test(tag) || tag.startsWith("aaa-luchtig-top-")),
      tags: tagKeys(doc).filter((tag) => !isManagedOrderTag(tag) && tag !== "light-reading").sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function desiredTagsFor(priority) {
  const desired = new Set();
  for (const sequence of priority.sequences) desired.add(ordinalTag(sequence, priority.positions[sequence]));
  for (const family of FAMILY_DEFINITIONS) {
    const position = priority.positions[family.sequence];
    if (!Number.isInteger(position)) continue;
    if (position <= 100) desired.add(family.top100Tag);
    if (position <= 10) desired.add(family.top10Tag);
  }
  if (priority.sequences.includes("luchtig")) desired.add("light-reading");
  return desired;
}

export function buildPriorityTagPlan(laterDocuments, outsideDocuments = [], options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const overrides = options.overrides ?? {};
  const activeLater = laterDocuments.filter((doc) => doc.location === undefined || doc.location === null || doc.location === "later");
  const excludedLater = laterDocuments.filter((doc) => !activeLater.includes(doc));
  const priority = buildPriorityExport(activeLater, { generatedAt, overrides });
  const sourceDocuments = [...activeLater, ...excludedLater, ...outsideDocuments];
  const changes = {};
  const operations = [];

  for (const doc of sourceDocuments) {
    const current = new Set(tagKeys(doc));
    const desired = priority.items[doc.id] ? desiredTagsFor(priority.items[doc.id]) : new Set();
    const remove = [...current].filter((tag) => isManagedOrderTag(tag) && !desired.has(tag)).sort();
    const add = [...desired].filter((tag) => !current.has(tag)).sort();
    if (remove.length === 0 && add.length === 0) continue;
    changes[doc.id] = { title: doc.title ?? "(zonder titel)", add, remove };
    remove.forEach((tag) => operations.push({ action: "remove", documentId: doc.id, tag }));
    add.forEach((tag) => operations.push({ action: "add", documentId: doc.id, tag }));
  }

  const sourceFingerprint = hash({ documents: stableSource(sourceDocuments), overrides });
  const body = {
    generatedAt,
    model: TAG_PLAN_MODEL,
    priorityModel: priority.model,
    scope: options.cleanupAll ? "all-locations" : "later",
    sourceFingerprint,
    summary: {
      documents: Object.keys(changes).length,
      additions: operations.filter(({ action }) => action === "add").length,
      removals: operations.filter(({ action }) => action === "remove").length,
      operations: operations.length,
    },
    changes,
    operations,
  };
  const plan = { ...body, planHash: hash(body) };
  validatePriorityTagPlan(plan);
  return plan;
}

export function validatePriorityTagPlan(plan) {
  if (plan?.model !== TAG_PLAN_MODEL) throw new Error(`Ongeldig tagplanmodel: ${plan?.model}`);
  if (plan?.priorityModel !== "readwise-priority-v3") throw new Error(`Ongeldig prioriteitsmodel: ${plan?.priorityModel}`);
  if (!['later', 'all-locations'].includes(plan.scope)) throw new Error(`Ongeldige tagplanscope: ${plan.scope}`);
  if (!/^[a-f0-9]{64}$/.test(plan.sourceFingerprint ?? "")) throw new Error("Tagplan mist een geldige bronfingerprint");
  const { planHash, ...body } = plan;
  if (hash(body) !== planHash) throw new Error("Tagplanhash komt niet overeen met de inhoud");
  if (!Array.isArray(plan.operations)) throw new Error("Tagplan mist operaties");
  for (const operation of plan.operations) {
    if (!['add', 'remove'].includes(operation.action) || !operation.documentId || !operation.tag) throw new Error("Ongeldige tagoperatie");
    if (!isManagedOrderTag(operation.tag) && operation.tag !== "light-reading") throw new Error(`Onbeheerde tag in plan: ${operation.tag}`);
  }
  if (plan.summary.operations !== plan.operations.length) throw new Error("Tagplansamenvatting klopt niet");
  return true;
}
