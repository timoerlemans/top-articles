export const MAINTENANCE_STAGE_ORDER = ["authors", "priority", "archive", "cleanup", "build"] as const;

export type MaintenanceStageName = typeof MAINTENANCE_STAGE_ORDER[number];

export interface MaintenanceStagePlan {
  stage: MaintenanceStageName;
  planHash: string;
  mutations: boolean;
  run?: boolean;
  confirmationRequired?: boolean;
  summary: Record<string, number>;
  details?: unknown;
}

export interface MaintenanceStageResult {
  ok: boolean;
  summary: Record<string, number>;
  message?: string;
}

export interface MaintenanceStageAdapter {
  plan: () => Promise<MaintenanceStagePlan>;
  apply: (plan: MaintenanceStagePlan) => Promise<MaintenanceStageResult>;
  verify: (plan: MaintenanceStagePlan) => Promise<MaintenanceStageResult>;
}

export interface MaintenancePlan {
  stages: MaintenanceStagePlan[];
}

export interface MaintenanceReportStage {
  stage: MaintenanceStageName;
  planHash: string;
  status: "verified" | "skipped" | "failed";
  summary: Record<string, number>;
  message?: string;
}

export interface MaintenanceReport {
  status: "verified" | "awaiting-confirmation" | "failed";
  stages: MaintenanceReportStage[];
  next?: { stage: MaintenanceStageName; planHash: string };
}

export type MaintenanceConfirmations = Partial<Record<MaintenanceStageName, string>>;

function stageReport(
  plan: MaintenanceStagePlan,
  status: MaintenanceReportStage["status"],
  result: MaintenanceStageResult,
): MaintenanceReportStage {
  return {
    stage: plan.stage,
    planHash: plan.planHash,
    status,
    summary: result.summary,
    ...(result.message === undefined ? {} : { message: result.message }),
  };
}

function failureResult(error: unknown, summary: Record<string, number>): MaintenanceStageResult {
  return {
    ok: false,
    summary,
    message: error instanceof Error ? error.message : String(error),
  };
}

function assertStagePlan(plan: MaintenanceStagePlan, expected: MaintenanceStageName): void {
  if (plan.stage !== expected || plan.planHash.length === 0) {
    throw new Error(`Ongeldig maintenance-plan voor stap ${expected}`);
  }
}

/** Orchestrates existing confirmed engines without owning their selection or transport policy. */
export function createMaintenanceRoute(
  stages: Record<MaintenanceStageName, MaintenanceStageAdapter>,
) {
  async function plan(): Promise<MaintenancePlan> {
    const plans: MaintenanceStagePlan[] = [];
    for (const stage of MAINTENANCE_STAGE_ORDER) {
      const current = await stages[stage].plan();
      assertStagePlan(current, stage);
      plans.push(current);
    }
    return { stages: plans };
  }

  async function apply(
    confirmations: MaintenanceConfirmations = {},
    planned?: MaintenancePlan,
    through: MaintenanceStageName = "build",
  ): Promise<MaintenanceReport> {
    const report: MaintenanceReport = { status: "verified", stages: [] };
    let sourceInvalidated = false;
    const throughIndex = MAINTENANCE_STAGE_ORDER.indexOf(through);
    if (throughIndex < 0) { throw new Error(`Onbekende onderhoudsstap: ${through}`); }
    for (const stage of MAINTENANCE_STAGE_ORDER.slice(0, throughIndex + 1)) {
      const plannedStage = planned?.stages.find((entry) => entry.stage === stage);
      const current = !sourceInvalidated && plannedStage !== undefined ? plannedStage : await stages[stage].plan();
      assertStagePlan(current, stage);
      if (current.mutations && current.confirmationRequired !== false && confirmations[stage] !== current.planHash) {
        report.status = "awaiting-confirmation";
        report.next = { stage, planHash: current.planHash };
        return report;
      }
      const shouldRun = current.mutations || current.run === true;
      if (shouldRun) {
        let result: MaintenanceStageResult;
        try {
          result = await stages[stage].apply(current);
        } catch (error: unknown) {
          result = failureResult(error, current.summary);
        }
        if (!result.ok) {
          report.status = "failed";
          report.stages.push(stageReport(current, "failed", result));
          return report;
        }
      }
      let verified: MaintenanceStageResult;
      try {
        verified = await stages[stage].verify(current);
      } catch (error: unknown) {
        verified = failureResult(error, current.summary);
      }
      if (!verified.ok) {
        report.status = "failed";
        report.stages.push(stageReport(current, "failed", verified));
        return report;
      }
      report.stages.push(stageReport(current, shouldRun ? "verified" : "skipped", verified));
      if (current.mutations) { sourceInvalidated = true; }
    }
    return report;
  }

  async function verify(through: MaintenanceStageName = "build"): Promise<MaintenanceReport> {
    const report: MaintenanceReport = { status: "verified", stages: [] };
    const throughIndex = MAINTENANCE_STAGE_ORDER.indexOf(through);
    if (throughIndex < 0) { throw new Error(`Onbekende onderhoudsstap: ${through}`); }
    for (const stage of MAINTENANCE_STAGE_ORDER.slice(0, throughIndex + 1)) {
      const current = await stages[stage].plan();
      assertStagePlan(current, stage);
      let result: MaintenanceStageResult;
      try {
        result = await stages[stage].verify(current);
      } catch (error: unknown) {
        result = failureResult(error, current.summary);
      }
      if (!result.ok) {
        report.status = "failed";
        report.stages.push(stageReport(current, "failed", result));
        return report;
      }
      report.stages.push(stageReport(current, current.mutations || current.run === true ? "verified" : "skipped", result));
      if (current.mutations) {
        report.status = "failed";
        const last = report.stages.at(-1);
        if (last) { last.message ??= "Er zijn nog niet-geverifieerde onderhoudsmutaties"; }
        return report;
      }
    }
    return report;
  }

  return { plan, apply, verify };
}
