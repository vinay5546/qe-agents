import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { GeneratedTest, TestPlan, TestScenario } from "../types/index.js";

const client = new Anthropic();

const OUTPUT_DIR = path.resolve("tests-generated");

const SYSTEM_PROMPT = `You write a single, self-contained supertest + vitest/jest-style
test file in TypeScript for ONE test scenario against the Orders API.

Conventions:
- Import the app via: import app from "../src/sut/server.js";
- Import supertest: import request from "supertest";
- Use describe/it/expect (assume a jest-compatible global test runner).
- Write concrete assertions, not TODOs. Include realistic request bodies.
- If the scenario is about concurrency/race conditions, issue concurrent
  requests with Promise.all and assert on the final consistent state.
- Output ONLY the raw TypeScript file contents. No markdown fences, no prose.`;

async function generateOneTest(scenario: TestScenario): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Scenario: ${JSON.stringify(scenario, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`Generator agent: no output for scenario ${scenario.id}`);
  }
  return textBlock.text.replace(/```typescript|```ts|```/g, "").trim();
}

export async function generateTestsFromPlan(plan: TestPlan): Promise<GeneratedTest[]> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const generated: GeneratedTest[] = [];

  for (const scenario of plan.scenarios) {
    const code = await generateOneTest(scenario);
    const fileName = `${scenario.id}.spec.ts`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(filePath, code, "utf-8");

    generated.push({
      scenarioId: scenario.id,
      filePath,
      framework: "supertest",
    });
  }

  return generated;
}
