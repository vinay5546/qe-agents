import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { GeneratedTest, TestPlan, TestScenario } from "../types/index.js";

const client = new Anthropic();
const OUTPUT_DIR = path.resolve("tests-generated");

const SYSTEM_PROMPT = `You write a single, self-contained Playwright API test file
in TypeScript for ONE test scenario against the Orders API.

Conventions:
- Import: import { test, expect } from "@playwright/test";
- Use the built-in \`request\` fixture — do NOT import supertest or start the app
  yourself. The base URL is already configured via playwright.config.ts
  (SUT_BASE_URL, defaults to [localhost](http://localhost:4000)
- Write concrete assertions, not TODOs. Include realistic request bodies.
- Structure as: test("<scenario description>", async ({ request }) => { ... });
- Use request.get/post/put/delete/patch, and response.status()/response.json().
- If the scenario is about concurrency/race conditions, issue concurrent
  requests with Promise.all and assert on the combined outcome.
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
      framework: "playwright",
    });
  }

  return generated;
}
