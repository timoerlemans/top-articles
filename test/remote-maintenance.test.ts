import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateRemoteChain,
  findRelatedRemoteRun,
  REMOTE_WORKFLOW_ORDER,
  type RemoteRunRecord,
} from "../scripts/lib/remote-maintenance.js";

function run(overrides: Partial<RemoteRunRecord> = {}): RemoteRunRecord {
  return {
    id: "root-1",
    workflow: REMOTE_WORKFLOW_ORDER[0],
    displayTitle: "Readwise maintenance manual-1",
    status: "completed",
    conclusion: "success",
    createdAt: "2026-10-14T10:00:00.000Z",
    url: "https://github.com/example/run/1",
    ...overrides,
  };
}

test("remote run correlation ignores an unrelated recent success", () => {
  const selected = findRelatedRemoteRun([
    run({ id: "unrelated", displayTitle: "Readwise archive na 10", workflow: REMOTE_WORKFLOW_ORDER[1] }),
    run({ id: "related", displayTitle: "Readwise archive na 1", workflow: REMOTE_WORKFLOW_ORDER[1], status: "queued", conclusion: null }),
  ], REMOTE_WORKFLOW_ORDER[1], "1");

  assert.equal(selected?.id, "related");
});

test("remote chain distinguishes pending, partial, failed, and verified runs", () => {
  const root = run();
  const archive = run({ id: "archive-1", workflow: REMOTE_WORKFLOW_ORDER[1], displayTitle: "Readwise archive na root-1" });
  const cleanup = run({ id: "cleanup-1", workflow: REMOTE_WORKFLOW_ORDER[2], displayTitle: "Readwise cleanup na archive-1" });
  const refresh = run({ id: "refresh-1", workflow: REMOTE_WORKFLOW_ORDER[3], displayTitle: "Readwise refresh na cleanup-1" });

  assert.equal(evaluateRemoteChain({ [REMOTE_WORKFLOW_ORDER[0]]: root }).status, "pending");
  assert.equal(evaluateRemoteChain({ [REMOTE_WORKFLOW_ORDER[0]]: root, [REMOTE_WORKFLOW_ORDER[1]]: { ...archive, conclusion: "failure" } }).status, "partial");
  assert.equal(evaluateRemoteChain({ [REMOTE_WORKFLOW_ORDER[0]]: { ...root, conclusion: "failure" } }).status, "failed");
  assert.equal(evaluateRemoteChain({
    [REMOTE_WORKFLOW_ORDER[0]]: root,
    [REMOTE_WORKFLOW_ORDER[1]]: archive,
    [REMOTE_WORKFLOW_ORDER[2]]: cleanup,
    [REMOTE_WORKFLOW_ORDER[3]]: refresh,
  }).status, "verified");
});

test("workflow triggers form one loop-free chain and refresh publishes current data", async () => {
  const workflows = await Promise.all([
    readFile(".github/workflows/priority-sync.yml", "utf8"),
    readFile(".github/workflows/archive-lees.yml", "utf8"),
    readFile(".github/workflows/archive-cleanup.yml", "utf8"),
    readFile(".github/workflows/refresh.yml", "utf8"),
  ]);
  const [priority, archive, cleanup, refresh] = workflows;
  assert.ok(priority);
  assert.match(priority, /workflow_dispatch:[\s\S]+request_id:/);
  assert.match(priority, /--through priority/);
  assert.match(priority, /readwise-maintenance-root-\$\{\{ github\.run_id \}\}/);
  assert.match(archive, /workflows: \["Synchroniseer Readwise-prioriteit"\]/);
  assert.match(archive, /archive:plan/);
  assert.doesNotMatch(archive, /workflow_dispatch/);
  assert.match(cleanup, /workflows: \["Archiveer niet-beschermde Readwise-Later-documenten"\]/);
  assert.doesNotMatch(cleanup, /workflow_dispatch/);
  assert.match(refresh, /workflows: \["Cleanup archived Readwise-tags"\]/);
  assert.doesNotMatch(refresh, /workflow_dispatch/);
  assert.match(refresh, /npm run build/);
  assert.match(refresh, /data\/data\.js data\/score\.js/);
});
