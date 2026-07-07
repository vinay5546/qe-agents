# QE Agents — Test Planning → Generation → Execution → Triage

An end-to-end slice of 4 QE agents operating on a small Orders API with 5
planted bugs (see `BUGS.md`). Plain TypeScript pipeline — no agentic
framework (see design doc for that tradeoff).

## Setup

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
docker network create qe-agents-net
docker build -f docker/Dockerfile.sut -t qe-agents-sut .
docker build -f docker/Dockerfile.sandbox -t qe-agents-sandbox .
docker run -d --network qe-agents-net --name sut -p 4000:4000 qe-agents-sut
```

## Run the full pipeline

```bash
npm run pipeline
```

This will:
1. **Plan** — read `src/sut/openapi.yaml`, produce a risk-based test plan
   (`console.log`s scenario count; pauses for review if the Planner raised
   open questions).
2. **Generate** — write one supertest file per scenario to `tests-generated/`.
3. **Execute** — run each generated test in a locked-down container
   (`--read-only`, `--memory 256m`, `--cpus 0.5`, no network except the SUT),
   retrying up to 2x to distinguish flaky from hard failures.
4. **Triage** — classify failures into severity-ranked, deduped defects with
   likely root cause and owner, printed as a table.

## Evaluating against ground truth

`BUGS.md` lists the 5 planted bugs. After a pipeline run, compare the
Triage Agent's output against that list to compute precision/recall —
see the design doc's "Evaluation methodology" section for the numbers
from our own run.

## Project structure

```
src/
  sut/          — Express Orders API with 5 planted bugs + its OpenAPI spec
  agents/       — planner.ts, generator.ts, executor.ts, triage.ts
  pipeline/     — run.ts: plain linear orchestration + human-in-the-loop pause
  types/        — shared PipelineState and stage I/O types
docker/         — Dockerfile.sut, Dockerfile.sandbox (sandboxed execution)
tests-generated/ — output of the Generator agent (gitignored except .gitkeep)
BUGS.md         — ground-truth answer key for evaluation (not fed to agents)
```
