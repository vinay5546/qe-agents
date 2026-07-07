import readline from "node:readline/promises";
import path from "node:path";
import { planFromArtifact } from "../agents/planner.js";
import { generateTestsFromPlan } from "../agents/generator.js";
import { executeTests } from "../agents/executor.js";
import { triageResults } from "../agents/triage.js";
import type { PipelineState } from "../types/index.js";

// A deliberately plain, linear pipeline: artifact -> plan -> tests -> results
// -> defects. No agentic framework — this is a fixed 4-stage flow with one
// conditional pause, which doesn't need graph/loop/branch machinery. See the
// design doc for the LangGraph-vs-plain-pipeline tradeoff discussion.

async function pauseForHuman(openQuestions: string[]): Promise<void> {
  console.log("\n⚠️  Planner flagged ambiguities it will NOT silently guess on:\n");
  openQuestions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(
    "\nReview the open questions above, then press Enter to continue (or Ctrl+C to stop and resolve them first)...\n"
  );
  rl.close();
}

export async function runPipeline(): Promise<void> {
  const state: PipelineState = {
    artifact: {
      kind: "openapi",
      path: path.resolve("src/sut/openapi.yaml"),
    },
    humanReviewNeeded: false,
  };

  console.log("── Stage 1: Test Planning ──────────────────────────────────");
  state.plan = await planFromArtifact(state.artifact);
  console.log(`Planner produced ${state.plan.scenarios.length} scenarios.`);

  if (state.plan.openQuestions.length > 0) {
    state.humanReviewNeeded = true;
    await pauseForHuman(state.plan.openQuestions);
  }

  console.log("\n── Stage 2: Test Generation ────────────────────────────────");
  state.generatedTests = await generateTestsFromPlan(state.plan);
  console.log(`Generated ${state.generatedTests.length} test files in tests-generated/.`);

  console.log("\n── Stage 3: Test Execution ─────────────────────────────────");
  state.executionReport = await executeTests(state.generatedTests);
  const summary = state.executionReport.results.reduce(
    (acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }),
    {} as Record<string, number>
  );
  console.log("Execution summary:", summary);

  console.log("\n── Stage 4: Defect Triaging ────────────────────────────────");
  state.triageReport = await triageResults(state.executionReport);
  console.log(
    `Triaged ${state.triageReport.defects.length} defects ` +
      `(${state.triageReport.flakyCount} flaky, ${state.triageReport.dedupedCount} deduped).`
  );
  console.table(
    state.triageReport.defects.map((d) => ({
      id: d.id,
      severity: d.severity,
      flaky: d.isFlaky,
      dup: d.duplicateOf ?? "-",
      title: d.title,
    }))
  );
}

runPipeline().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
