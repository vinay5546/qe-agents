// Shared state object that flows through every pipeline stage.
// Each stage reads what it needs and appends its own output — nothing is
// mutated destructively, so we always have a full audit trail of how a
// defect traces back to the original artifact.

export interface InputArtifact {
  kind: "openapi" | "prd" | "code";
  path: string; // path to the artifact on disk
}

export interface TestScenario {
  id: string;
  title: string;
  description: string;
  priority: "P0" | "P1" | "P2";
  category: "happy-path" | "boundary" | "negative" | "security" | "data-integrity";
  endpoint?: string; // e.g. "PATCH /orders/:id"
}

export interface TestPlan {
  scenarios: TestScenario[];
  coverageSummary: string;
  entryCriteria: string[];
  exitCriteria: string[];
  openQuestions: string[]; // ambiguities the Planner refused to silently guess on
}

export interface GeneratedTest {
  scenarioId: string;
  filePath: string;
  framework: "playwright";
}

export interface TestPlanWithCode {
  plan: TestPlan;
  generatedTests: GeneratedTest[];
}

export type TestOutcome = "pass" | "fail" | "flaky";

export interface TestResult {
  scenarioId: string;
  filePath: string;
  outcome: TestOutcome;
  attempts: number; // how many times it was rerun
  stderr?: string;
  durationMs: number;
}

export interface ExecutionReport {
  results: TestResult[];
  startedAt: string;
  finishedAt: string;
}

export type DefectSeverity = "S1" | "S2" | "S3" | "S4";

export interface Defect {
  id: string;
  scenarioId: string;
  title: string;
  severity: DefectSeverity;
  isFlaky: boolean;
  likelyRootCause: string;
  suggestedOwner: string; // e.g. "orders-service" component owner
  duplicateOf?: string; // id of an existing defect, if deduped
  evidence: string; // stderr excerpt / stack trace summary
}

export interface TriageReport {
  defects: Defect[];
  flakyCount: number;
  dedupedCount: number;
}

// The single object threaded through the whole pipeline.
export interface PipelineState {
  artifact: InputArtifact;
  plan?: TestPlan;
  generatedTests?: GeneratedTest[];
  executionReport?: ExecutionReport;
  triageReport?: TriageReport;
  humanReviewNeeded: boolean;
}
