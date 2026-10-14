# Remote priority-sync design

## Goal

Expose the already-confirmable local maintenance engines through one explicit GitHub Actions
entry point, while keeping the automatic repository chain ordered and loop-free:

`priority-sync -> general archive -> archive cleanup -> refresh/publication`.

## Decisions

- Only `priority-sync.yml` has `workflow_dispatch`; child workflows run exclusively from a successful
  `workflow_run` of their immediate parent.
- The root workflow uses a unique manual request ID in its run name. Every child run includes its
  parent run ID in its run name, so the skill can select the exact related run instead of a recent
  run on the same workflow.
- Each run publishes a small context artifact containing the parent run, branch, initial SHA and
  final SHA. Children download this artifact before checkout, so automatic commits from an earlier
  step are included without checking out an arbitrary current branch tip.
- The root invokes the local route only through `priority`, with repository automation supplying the
  exact current hashes and repeating after the route replans. The child workflows invoke the
  existing archive, cleanup and build engines with their own plan/apply/verify gates.
- The refresh workflow is triggered by cleanup, not by priority-sync. This prevents publication
  before general afvloeiing and prevents a trigger cycle.
- The remote skill reports every run URL, final conclusion, context SHA and available plan/journal
  counts. A successful priority run followed by a failed archive, cleanup or refresh is partial
  success, never a completed chain.

## Out of scope

The remote route does not change mail products, does not authorize local mutation, and does not
perform a live dispatch or Reader mutation during implementation.
