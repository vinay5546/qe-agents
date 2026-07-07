import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { InputArtifact, TestPlan } from "../types/index.js";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT = `You are a senior QE engineer producing a risk-based test plan
from a product artifact (an OpenAPI spec, in this case).

Rules:
- Prioritize scenarios by risk: what's most likely to break, and what would
  hurt most if it did (data integrity, auth, concurrency > cosmetic issues).
- Include boundary and negative cases, not just happy paths.
- If the spec is ambiguous or under-specified about expected behavior
  (e.g. exact status codes, pagination semantics, merge vs overwrite
  behavior), do NOT guess. Put it in "openQuestions" instead.
- Respond with ONLY valid JSON matching this shape, no prose, no markdown fences:

{
  "scenarios": [
    { "id": string, "title": string, "description": string,
      "priority": "P0"|"P1"|"P2",
      "category": "happy-path"|"boundary"|"negative"|"security"|"data-integrity",
      "endpoint": string }
  ],
  "coverageSummary": string,
  "entryCriteria": string[],
  "exitCriteria": string[],
  "openQuestions": string[]
}`;

export async function planFromArtifact(artifact: InputArtifact): Promise<TestPlan> {
  const specText = fs.readFileSync(artifact.path, "utf-8");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the artifact (${artifact.kind}):\n\n${specText}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Planner agent: no text response from model");
  }

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  const plan = JSON.parse(cleaned) as TestPlan;

  // Defensive fallback: never let an empty scenarios array through silently.
  if (!plan.scenarios || plan.scenarios.length === 0) {
    throw new Error("Planner agent produced no scenarios — check artifact input");
  }

  return plan;
}
