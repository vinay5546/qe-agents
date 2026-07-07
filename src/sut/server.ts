import express from "express";

// ---------------------------------------------------------------------------
// Orders API — the system under test.
//
// This service intentionally contains 5 planted bugs of different classes,
// used as ground truth to measure the QE Agents' precision/recall in the
// design doc. See BUGS.md for the labeled list (do not read that file before
// letting the Planner/Generator agents run "cold" — it's the answer key).
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

interface Order {
  id: string;
  customerId: string;
  quantity: number;
  status: "pending" | "confirmed" | "shipped";
  notes?: string;
  version: number; // used for the concurrent-update bug
}

const orders = new Map<string, Order>();
let nextId = 1;

function seed() {
  const id = String(nextId++);
  orders.set(id, {
    id,
    customerId: "cust-1",
    quantity: 2,
    status: "pending",
    notes: "leave at front door",
    version: 1,
  });
}
seed();

// --- BUG 1: off-by-one in pagination -------------------------------------
// `limit` is applied as an inclusive slice end instead of exclusive count,
// so page size 10 silently returns 11 items.
app.get("/orders", (req, res) => {
  const limit = Number(req.query.limit ?? 10);
  const offset = Number(req.query.offset ?? 0);
  const all = Array.from(orders.values());
  const page = all.slice(offset, offset + limit + 1); // <-- off-by-one
  res.json({ items: page, total: all.length });
});

// --- BUG 2: missing input validation --------------------------------------
// Negative or zero quantity is accepted without rejection.
app.post("/orders", (req, res) => {
  const { customerId, quantity, notes } = req.body ?? {};
  if (!customerId) {
    return res.status(400).json({ error: "customerId is required" });
  }
  // Missing: quantity <= 0 check
  const id = String(nextId++);
  const order: Order = {
    id,
    customerId,
    quantity,
    status: "pending",
    notes,
    version: 1,
  };
  orders.set(id, order);
  res.status(201).json(order);
});

// --- BUG 3: race condition on concurrent update ---------------------------
// No optimistic-concurrency check against `version` before writing, so two
// concurrent PATCH requests can clobber each other. This is intermittent —
// good ground truth for the Executor's flaky-vs-real detection.
app.patch("/orders/:id/status", async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "not found" });

  const { status } = req.body ?? {};
  // Simulated processing delay widens the race window.
  await new Promise((r) => setTimeout(r, Math.random() * 30));

  order.status = status; // <-- no version check, last-write-wins
  order.version += 1;
  orders.set(order.id, order);
  res.json(order);
});

// --- BUG 4: wrong status code on auth failure -----------------------------
// Returns 401 (Unauthenticated) when the correct semantic is 403
// (Authenticated but not authorized) for a customer accessing another
// customer's order.
app.get("/orders/:id", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "not found" });

  const requestingCustomer = req.header("x-customer-id");
  if (requestingCustomer && requestingCustomer !== order.customerId) {
    return res.status(401).json({ error: "not allowed" }); // <-- should be 403
  }
  res.json(order);
});

// --- BUG 5: silent data loss on partial update ----------------------------
// PATCH /orders/:id is documented as a partial update but overwrites the
// whole `notes` field structure instead of merging, silently dropping
// unspecified fields if the client sends a partial notes object.
app.patch("/orders/:id", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "not found" });

  const updates = req.body ?? {};
  // Bug: spreads over the whole order instead of merging nested fields,
  // and does not increment `version`, defeating the (already-broken)
  // concurrency check used elsewhere.
  const updated: Order = { ...order, ...updates };
  orders.set(order.id, updated);
  res.json(updated);
});

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`Orders API (SUT) listening on :${PORT}`);
});

export default app;
