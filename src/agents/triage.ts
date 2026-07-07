import Anthropic from "@anthropic-ai/sdk";
import type { Defect, ExecutionReport, TriageReport } from "../types/index.js";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are triaging test failures from an Orders API test suite.

You will receive a list of failed/flaky test results (scenarioId, outcome,
stderr excerpt, attempts). For each:
- Classify severity: S1 (data loss/security/corruption), S2 (broken core
  flow), S3 (edge case/minor), S4 (cosmetic).
- Estimate likely root cause and likely owning component, from the stderr
  and endpoint implied by the scenarioId/stderr.
- Cluster/dedup: if two failures clearly stem from the same root cause
  (e.g. same endpoint, same error signature), mark the second as a
  duplicate of the first via "duplicateOf".
- Respect the "flaky" outcome already assigned by the executor — do not
  re-classify a flaky result as a hard failure, but DO still triage it
  (flaky != ignorable; note it as flaky in the defect).

Respond with ONLY valid JSON, no prose, no markdown fences, matching:
{
  "defects": [
    { "id": string, "scenarioId": string, "title": string,
      "severity": "S1"|"S2"|"S3"|"S4", "isFlaky": boolean,
      "likelyRootCause": string, "suggestedOwner": string,
      "duplicateOf": string | null, "evidence": string }
  ]
}`;

export async function triageResults(report: ExecutionReport): Promise<TriageReport> {
  const failures = report.results.filter((r) => r.outcome !== "pass");

  if (failures.length === 0) {
    return { defects: [], flakyCount: 0, dedupedCount: 0 };
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: JSON.stringify(failures, null, 2) },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Triage agent: no text response from model");
  }

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as { defects: Defect[] };

  const flakyCount = parsed.defects.filter((d) => d.isFlaky).length;
  const dedupedCount = parsed.defects.filter((d) => d.duplicateOf).length;

  return { defects: parsed.defects, flakyCount, dedupedCount };
}
