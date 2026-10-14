export const REMOTE_WORKFLOW_ORDER = [
  "Synchroniseer Readwise-prioriteit",
  "Archiveer niet-beschermde Readwise-Later-documenten",
  "Cleanup archived Readwise-tags",
  "Refresh Readwise data",
] as const;

export type RemoteWorkflowName = typeof REMOTE_WORKFLOW_ORDER[number];
export type RemoteRunStatus = "queued" | "in_progress" | "completed";
export type RemoteRunConclusion = "success" | "failure" | "cancelled" | "skipped" | null;

export interface RemoteRunRecord {
  id: string;
  workflow: string;
  displayTitle: string;
  status: RemoteRunStatus;
  conclusion: RemoteRunConclusion;
  createdAt: string;
  url: string;
}

export interface RemoteChainEvaluation {
  status: "pending" | "verified" | "partial" | "failed";
  completed: RemoteWorkflowName[];
  blockingWorkflow?: RemoteWorkflowName;
}

/** Selects only the child run whose display title ends with the exact parent ID. */
export function findRelatedRemoteRun(
  runs: readonly RemoteRunRecord[],
  workflow: RemoteWorkflowName,
  parentRunId: string,
): RemoteRunRecord | null {
  return [...runs]
    .filter((run) => run.workflow === workflow && run.displayTitle.endsWith(parentRunId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

export function evaluateRemoteChain(
  runs: Readonly<Partial<Record<RemoteWorkflowName, RemoteRunRecord | null>>>,
): RemoteChainEvaluation {
  const completed: RemoteWorkflowName[] = [];
  for (const workflow of REMOTE_WORKFLOW_ORDER) {
    const run = runs[workflow] ?? null;
    if (run === null || run.status !== "completed") {
      return { status: "pending", completed };
    }
    if (run.conclusion !== "success") {
      return {
        status: completed.length === 0 ? "failed" : "partial",
        completed,
        blockingWorkflow: workflow,
      };
    }
    completed.push(workflow);
  }
  return { status: "verified", completed };
}
