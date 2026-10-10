import { parseReadwiseDocumentPage } from "./external-schemas.js";
import type { ReadwiseDocument } from "./external-schemas.js";
import type { ReadwiseExecutor } from "./readwise-request.js";

export type ReadwiseDocumentLocation = "later" | "new" | "shortlist" | "archive" | "feed";
export type ReadwiseDocumentProfile = "catalog" | "maintenance" | "judge" | "report" | "feedback" | "archive-cleanup";
export type ReadwiseDocumentSelection = { profile: ReadwiseDocumentProfile } & (
  | { location: ReadwiseDocumentLocation; documentId?: never }
  | { documentId: string; location?: never }
);

const RESPONSE_FIELDS: Readonly<Record<ReadwiseDocumentProfile, string>> = {
  catalog: "title,author,site_name,summary,word_count,reading_time,published_date,saved_at,image_url,source_url,url,category,tags,notes",
  maintenance: "title,author,summary,word_count,reading_time,published_date,saved_at,updated_at,category,location,reading_progress,tags,notes",
  judge: "title,summary,word_count,reading_time,published_date,saved_at,category,tags,notes,location",
  report: "title,author,summary,word_count,reading_time,published_date,saved_at,category,tags,notes,location",
  feedback: "title,author,summary,notes,location,category,word_count,reading_time,published_date,saved_at,tags",
  "archive-cleanup": "title,saved_at,category,location,tags",
};

/** Fetch the complete selection, or fail without returning partial documents. */
export async function fetchReadwiseDocuments(
  runReadwise: ReadwiseExecutor<{ stdout: string }>,
  selection: ReadwiseDocumentSelection,
): Promise<ReadwiseDocument[]> {
  const documents: ReadwiseDocument[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const args = ["reader-list-documents"];
    if (selection.location !== undefined) {
      args.push("--location", selection.location);
    } else {
      args.push("--id", selection.documentId);
    }
    args.push("--limit", "100", "--response-fields", RESPONSE_FIELDS[selection.profile], "--json");
    if (cursor) {args.push("--page-cursor", cursor);}
    const { stdout } = await runReadwise(args);
    const page = parseReadwiseDocumentPage(JSON.parse(stdout));
    documents.push(...page.documents);
    cursor = page.nextPageCursor;
    if (cursor && cursors.has(cursor)) {
      throw new Error("Reader herhaalt een paginacursor; documenten ophalen afgebroken.");
    }
    if (cursor) {cursors.add(cursor);}
  } while (cursor);
  return documents;
}
