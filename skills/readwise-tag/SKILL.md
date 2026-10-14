---
name: readwise-tag
description: Tag untagged Readwise documents using a personal taxonomy
---

You are tagging untagged documents in the user's Readwise Reader library. Follow this process carefully.

## Repository v2 contract

Read [`../readwise-reference.md`](../readwise-reference.md) before classifying in the repository checkout. When installed separately, locate the repository through the current valid worktree, `TOP_ARTICLES_REPO`, or `/mnt/c/dev/top-articles`, then read `<repository>/skills/readwise-reference.md`; do not assume the relative link exists. Normalize aliases through `scripts/lib/readwise-tags.ts`; replace only content-taxonomy tags. Preserve administrative, curatoriale, language, workflow, ordinal, and toplist tags exactly as received. The maximum of three applies only to content tags. Preferred-author recognition uses only reliable `author` metadata; title text is never enough. For Later, use the canonical priority plan to add `want-to-read` idempotently for Eleanor Konik or Henrik Karlsson; do not invent a separate author score. If the full current tagset is not known, do not send a bulk replacement: use known add/remove operations and retain opaque tags. Inspect and report the resulting metadata for every document.

**Direct output:** Voordat je ook maar één tool aanroept of vraag stelt, output precies deze regel: `Documenten taggen...`

## Readwise Access

Check if Readwise MCP tools are available (e.g. `mcp__readwise__reader_list_documents`). If they are, use them throughout. If not, use the equivalent `readwise` CLI commands. The instructions below reference MCP tool names.

## Taxonomy

Always pick from this list of tags. Use lowercase exactly as written:

- `learning & meta-learning`
- `behavioral psychology & coaching`
- `adhd & neurodivergence`
- `political philosophy`
- `totalitarianism & fascism`
- `ai ethics & society`
- `philosophy`
- `history`
- `sociology & social structures`
- `economics`
- `technology`
- `science`
- `arts & culture`
- `fiction`
- `games`
- `current affairs & politics`
- `business & startups`
- `professional development`
- `software development`
- `front-end software development`
- `health & wellness`
- `personal growth & life philosophy`
- `environment & sustainability`
- `food & cooking`
- `sports & recreation`
- `entertainment & pop culture`
- `research papers & academia`
- `professional documents`

If no category fits, create a fitting custom lowercase tag (e.g. `linguistics`, `urban planning`).

## Gebruikersprofiel (context voor betere tags)

Gebruik dit profiel om bij twijfel de meest relevante tag te kiezen:

- AI-gerelateerd → `ai ethics & society` of `technology` (business-angle pas als dat echt primair is)
- Politieke filosofie, ideologieën (socialisme, fascisme, anarchisme) → `political philosophy` of `totalitarianism & fascism`
- Filosofie (Stoïcijnen, continentaal, ethiek) → `philosophy`
- West-Europese geschiedenis, cultuurgeschiedenis → `history`
- Urbanisme, sociale structuren, ongelijkheid → `sociology & social structures`
- Games/films/series als cultureel fenomeen → `arts & culture` of `games` (niet `entertainment & pop culture` tenzij het echt oppervlakkig is)
- Essay schrijven, schrijfcraft → `learning & meta-learning` of `arts & culture`
- PKM, notities, leerstrategieën → `learning & meta-learning`
- Fantasy/sci-fi boeken → `fiction`
- Ouderschap zorgintensieve kinderen → `health & wellness`
- Front-end software development → `front-end software development` (kerninteresse; frontend-architectuur, HTML/CSS/JavaScript, toegankelijkheid, performance, responsive design, design systems)
- Software development → `software development` (bredere interesse; programmeerconcepten, software-architectuur en developer tooling; gebruik de front-end-tag als die specifieke invalshoek centraal staat)

## Setup

Ask the user which location to tag, unless they already specified one or provided a document ID:

> Which location would you like to tag?
> - **inbox** (new/unread) — default
> - **later**
> - **feed**
> - Or paste a specific document ID

## Step 1: Fetch Documents

Based on the chosen location, fetch documents using `mcp__readwise__reader_list_documents` with:

```
location = <chosen location>  # "new", "later", or "feed"
limit = 50
response_fields = ["title", "author", "site_name", "summary", "tags"]
```

Note: `id` is always included automatically — do NOT add it to `response_fields`.

If the user provided a specific document ID, fetch only that document using `mcp__readwise__reader_get_document_details`.

## Step 2: Classify Documents

For each document:

1. Use `title` + `author` + `site_name` + `summary` to determine the best **1-3 tags** from the taxonomy.
2. If the document already has tags, evaluate whether they are accurate and well-chosen from the taxonomy. If the existing tags are correct and complete, keep them as-is. If they are vague, wrong, auto-generated gibberish, or missing important taxonomy tags, replace them with better ones.
3. Prefer specificity over breadth. Don't pile on generic tags — pick the most accurate 1-3.

Build a list of `(document_id, [tag1, tag2, ...])` pairs for all documents, noting whether existing tags were kept, updated, or newly added.

## Step 3: Apply Tags Safely

Fetch the current complete tag representation immediately before a write. For a complete array of strings or readable `name`/`key` objects, calculate `(current tags - old content tags) + new canonical content tags` and use the bulk endpoint, maximum 50 documents per call. This preserves administrative, curation, language, workflow, ordinal, toplist, and unknown tags; the three-tag limit applies only to content tags.

If `tags` is missing, `null`, primitive, or contains one unreadable item, the tagset is incomplete. Do not send a bulk replacement and never substitute an empty array. Use separate known `reader-add-tags-to-document` and `reader-remove-tags-from-document` calls for the content changes, leaving unknown tags untouched. Inspect the result for every document and report rejected or partial operations.

## Step 4: Report Results

After tagging, present a compact summary:

**Tagging complete — {n} documents tagged, {m} skipped (already tagged)**

| Title | Tags Applied |
|-------|-------------|
| {title} | `{tag1}`, `{tag2}` |
| ... | ... |

If any documents were skipped, list their titles under a "Already tagged — skipped" section.

## Notes

- Never apply more than 3 tags per document. 1-2 is usually right.
- When in doubt between a broad and a specific tag, pick the specific one.
- `professional documents` is for things like contracts, reports, specs — not general professional development reading.
- `research papers & academia` is for actual academic papers, not just formal writing.
- Prioritize the user's reading context: a business article about AI should be `ai ethics & society` or `technology`, not `business & startups`, unless the business angle is the primary focus.
