import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { PriorityDocument } from "./priority-document.js";
import { readwiseDocumentSchema } from "./external-schemas.js";
import { fetchReadwiseDocuments } from "./readwise-documents.js";
import type { ReadwiseDocument } from "./external-schemas.js";
import type { ReadwiseExecutor } from "./readwise-request.js";
import { splitReadingFeedback } from "./reader-notes.js";
import { fetchReviewSource, reviewSourceFromDetails } from "./priority-review-source.js";

interface ReviewSnapshot {
  version: 1;
  scope: "later";
  documents: PriorityDocument[];
}

interface ReviewContext {
  version: 1;
  preparedAt: string;
  document: PriorityDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error("Ongeldig document-ID voor reviewbron");
  }
  return value;
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function readOptional(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (error: unknown) {
    if (isNotFound(error)) {return undefined;}
    throw error;
  }
}

async function readSnapshot(directory: string): Promise<ReviewSnapshot> {
  const value = await readJson(resolve(directory, "snapshot.json"));
  if (!isRecord(value) || value.version !== 1 || value.scope !== "later" || !Array.isArray(value.documents)) {
    throw new Error("Ongeldige reviewsnapshot");
  }
  return value as unknown as ReviewSnapshot;
}

function metadataDocument(item: ReadwiseDocument, id: string): PriorityDocument {
  const metadata: Record<string, unknown> = { ...item };
  delete metadata.content;
  delete metadata.html_content;
  const { contentNotes } = splitReadingFeedback(typeof metadata.notes === "string" ? metadata.notes : null);
  metadata.notes = contentNotes ?? null;
  return { ...metadata, id };
}

async function createHistoryDirectory(directory: string, id: string): Promise<string> {
  const parent = resolve(directory, "history", id);
  await mkdir(parent, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const name = suffix === 0 ? timestamp : `${timestamp}-${suffix}`;
    const candidate = resolve(parent, name);
    try {
      await mkdir(candidate);
      return candidate;
    } catch (error: unknown) {
      if (isRecord(error) && error.code === "EEXIST") {continue;}
      throw error;
    }
  }
  throw new Error("Kon geen unieke reviewhistorie-map maken");
}

async function archivePrevious(directory: string, id: string): Promise<void> {
  const sourceJson = resolve(directory, "sources", `${id}.json`);
  const sourceMarkdown = resolve(directory, "sources", `${id}.md`);
  const assessment = resolve(directory, "assessments", `${id}.json`);
  const context = resolve(directory, "contexts", `${id}.json`);
  const previous = await Promise.all([
    readOptional(sourceJson), readOptional(sourceMarkdown), readOptional(assessment), readOptional(context),
  ]);
  if (previous.every((value) => value === undefined)) {return;}

  const history = await createHistoryDirectory(directory, id);
  const paths = [sourceJson, sourceMarkdown, assessment, context] as const;
  const names = ["source.json", "source.md", "assessment.json", "context.json"] as const;

  // Copy source and context files first. The assessment itself is moved after the copies succeed.
  for (const index of [0, 1, 3] as const) {
    if (previous[index] !== undefined) {
      await copyFile(paths[index], resolve(history, names[index]));
    }
  }
  if (previous[2] !== undefined) {
    await rename(assessment, resolve(history, "assessment.json"));
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function removeIfPresent(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error: unknown) {
    if (!isNotFound(error)) {throw error;}
  }
}

/** Refresh selected frozen-run sources and private context without producing judgments or config edits. */
export async function refreshPriorityReviewSources(
  run: ReadwiseExecutor<{ stdout: string }>,
  directory: string,
  documentIds: readonly string[],
): Promise<void> {
  if (documentIds.length === 0) {throw new Error("Selectie voor bronverversing is leeg");}
  const ids = documentIds.map(safeId);
  if (new Set(ids).size !== ids.length) {throw new Error("Dubbele document-IDs in bronverversing");}

  const runDirectory = resolve(directory);
  const snapshot = await readSnapshot(runDirectory);
  const frozenIds = new Set(snapshot.documents.flatMap((document) => isRecord(document) && typeof document.id === "string" ? [document.id] : []));
  for (const id of ids) {
    if (!frozenIds.has(id)) {throw new Error("Document-ID ontbreekt in de bevroren reviewsnapshot");}
  }

  for (const id of ids) {
    const fetched = await fetchReadwiseDocuments(run, { profile: "review", documentId: id });
    if (fetched.length !== 1 || fetched[0]?.id !== id) {
      throw new Error("Readwise gaf niet exact het gevraagde document terug");
    }
    const item = fetched[0];
    if (item.location !== "later") {throw new Error("Reviewbron staat niet meer in Later");}

    const document = metadataDocument(item, id);
    const preparedAt = new Date().toISOString();
    let source = reviewSourceFromDetails(document, item, preparedAt);
    if (source.availability !== "available") {
      source = await fetchReviewSource(run, document);
    }

    await archivePrevious(runDirectory, id);
    await mkdir(resolve(runDirectory, "sources"), { recursive: true });
    await mkdir(resolve(runDirectory, "contexts"), { recursive: true });
    const context: ReviewContext = { version: 1, preparedAt, document };
    await writeJson(resolve(runDirectory, "contexts", `${id}.json`), context);
    await writeJson(resolve(runDirectory, "sources", `${id}.json`), source);
    const markdownPath = resolve(runDirectory, "sources", `${id}.md`);
    if (source.content !== null) {
      await writeFile(markdownPath, source.content);
    } else {
      await removeIfPresent(markdownPath);
    }
  }
}

/** Resolve refreshed per-document metadata while keeping the original snapshot immutable. */
export async function resolveReviewDocument(directory: string, frozen: PriorityDocument): Promise<PriorityDocument> {
  const id = safeId(frozen.id);
  const path = resolve(resolve(directory), "contexts", `${id}.json`);
  let value: unknown;
  try {
    value = await readJson(path);
  } catch (error: unknown) {
    if (isNotFound(error)) {return frozen;}
    throw error;
  }

  if (!isRecord(value) || value.version !== 1 || typeof value.preparedAt !== "string" ||
      !Number.isFinite(Date.parse(value.preparedAt)) || !isRecord(value.document) ||
      "content" in value.document || "html_content" in value.document) {
    throw new Error("Ongeldige reviewcontext of document-ID komt niet overeen");
  }
  const parsedDocument = readwiseDocumentSchema.safeParse(value.document);
  if (!parsedDocument.success || parsedDocument.data.id !== id) {
    throw new Error("Ongeldige reviewcontext of document-ID komt niet overeen");
  }
  return parsedDocument.data;
}
