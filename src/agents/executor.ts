import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TestOutcome } from "../types/index.js";

const execFileAsync = promisify(execFile);

const MAX_RETRIES = 2; // a test that fails then passes on rerun => "flaky", not "fail"

// Runs a single generated test file via the local Playwright CLI.
// No Docker sandbox — relies on Playwright's own process isolation per test file.
async function runOnce(filePath: string): Promise<{ passed: boolean; stderr: string; durationMs: number }> {
  const start = Date.now();
  try {
    await execFileAsync("npx", ["playwright", "test", filePath, "--reporter=line"], {
      env: { ...process.env, SUT_BASE_URL: process.env.SUT_BASE_URL ?? "[localhost](http://localhost:4000)" },
    });
    return { passed: true, stderr: "", durationMs: Date.now() - start };
  } catch (err: any) {
    return {
      passed: false,
      stderr: String(err.stderr ?? err.message ?? "unknown error").slice(0, 2000),
      durationMs: Date.now() - start,
    };
  }
}

export async function executeTests(generatedTests: { scenarioId: string; filePath: string }[]) {
  const startedAt = new Date().toISOString();
  const results = [];

  for (const t of generatedTests) {
    let attempt = await runOnce(t.filePath);
    let attempts = 1;
    let outcomes = [attempt.passed];
    while (!attempt.passed && attempts <= MAX_RETRIES) {
      attempt = await runOnce(t.filePath);
      attempts++;
      outcomes.push(attempt.passed);
    }
    const outcome: TestOutcome = outcomes.every((p) => p)
      ? "pass"
      : outcomes.some((p) => p)
        ? "flaky"
        : "fail";
    results.push({
      scenarioId: t.scenarioId,
      filePath: t.filePath,
      outcome,
      attempts,
      stderr: attempt.stderr,
      durationMs: attempt.durationMs,
    });
  }

  const finishedAt = new Date().toISOString();

  return { startedAt, finishedAt, results };
}

