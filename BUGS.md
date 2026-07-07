# Planted Bugs — Ground Truth (for evaluation only)

Used to compute the QE Agents' triage precision/recall in the design doc.
Do not feed this file to the Planner/Generator agents.

| # | Endpoint | Bug class | Description | Expected severity |
|---|----------|-----------|-------------|--------------------|
| 1 | `GET /orders` | Boundary / off-by-one | `limit=N` returns N+1 items | S3 |
| 2 | `POST /orders` | Negative / validation | Accepts `quantity <= 0` | S2 |
| 3 | `PATCH /orders/:id/status` | Concurrency / race | No optimistic lock; concurrent updates clobber each other. **Intermittent** — this is the flaky-vs-real test case | S1 |
| 4 | `GET /orders/:id` | Security / status code | Returns 401 instead of 403 for cross-customer access | S3 |
| 5 | `PATCH /orders/:id` | Data integrity | Partial update silently drops fields instead of merging | S1 |

## How to use this for the eval section of the design doc

1. Run the full pipeline
2. Record: did the Planner's scenarios have coverage that *could* catch each bug?
3. Record: did the Triage Agent correctly identify each real failure, correctly
   flag #3 as intermittent rather than a flat failure, and not double-count
   duplicates?
4. Compute precision = true defects / all defects raised;
   recall = bugs found / 5 planted bugs.
