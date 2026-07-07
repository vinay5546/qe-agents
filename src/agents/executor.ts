import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecutionReport, GeneratedTest, TestOutcome, TestResult } from "../types/index.js";

const execFileAsync = promisify(execFile);

const MAX_RETRIES = 2; // a test that fails then passes on rerun => "flaky", not "fail"
const CONTAINER_IMAGE = "qe-agents-sandbox"; // built from docker/Dockerfile.sandbox

// Runs a single generated test file inside a locked-down container:
// - no network access except to the SUT container on a private docker network
// - read-only filesystem mount for the test file
// - CPU/memory limits to bound any runaway AI-generated code
async function runOnce(filePath: string): Promise<{ passed: boolean; stderr: string; durationMs: number }> {
  const start = Date.now();
  try {
    await execFileAsync("docker", [
      "run",
      "--rm",
      "--network",
      "qe-agents-net",
      "--memory",
      "256m",
      "--cpus",
      "0.5",
      "--read-only",
      "--tmpfs",
      "/tmp",
      "-v",
      `${filePath}:/app/test.spec.ts:ro`,
      CONTAINER_IMAGE,
      "npx",
      "jest",
      "/app/test.spec.ts",
    ]);
    return { passed: true, stderr: "", durationMs: Date.now() - start };
  } catch (err: any) {
    return {
      passed: false,
      stderr: String(err.stderr ?? err.message ?? "unknown error").slice(0, 2000),
      durationMs: Date.now() - start,
    };
  }
}

async function runWithRetries(test: GeneratedTest): Promise<TestResult> {
  let attempts = 0;
  let lastStderr = "";
  let lastDuration = 0;
  const outcomes: boolean[] = [];

  while (attempts < 1 + MAX_RETRIES) {
    attempts += 1;
    const { passed, stderr, durationMs } = await runOnce(test.filePath);
    outcomes.push(passed);
    lastStderr = stderr;
    lastDuration = durationMs;
    if (passed && attempts > 1) break; // recovered after a failure -> stop early, mark flaky below
    if (!passed && attempts === 1) continue; // give it a chance to prove itself
    if (passed) break;
  }

  const allPassed = outcomes.every(Boolean);
  const allFailed = outcomes.every((o) => !o);
  const outcome: TestOutcome = allPassed
    ? "pass"
    : allFailed
    ? "fail"
    : "flaky"; // mixed results across retries = flaky, not a hard fail

  return {
    scenarioId: test.scenarioId,
    filePath: test.filePath,
    outcome,
    attempts,
    stderr: outcome === "pass" ? undefined : lastStderr,
    durationMs: lastDuration,
  };
}

export async function executeTests(tests: GeneratedTest[]): Promise<ExecutionReport> {
  const startedAt = new Date().toISOString();

  // Run in parallel, bounded to avoid saturating the host during grading.
  const CONCURRENCY = 4;
  const results: TestResult[] = [];
  for (let i = 0; i < tests.length; i += CONCURRENCY) {
    const batch = tests.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(runWithRetries));
    results.push(...batchResults);
  }

  return { results, startedAt, finishedAt: new Date().toISOString() };
}
