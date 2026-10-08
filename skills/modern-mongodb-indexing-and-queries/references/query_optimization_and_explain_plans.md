# Query Optimization & Explain Plan Diagnostics

Performance engineering in MongoDB requires data-driven analysis using `explain("executionStats")`. Relying on assumptions about index usage often leads to silent full collection scans (`COLLSCAN`), high CPU utilization, and out-of-memory crashes on sort stages.

---

## 1. Running and Interpreting `explain("executionStats")`

To run diagnostic profiling on any query:
```javascript
db.orders.find({
  status: "CONFIRMED",
  totalAmount: { $gte: NumberDecimal("100.00") }
})
.sort({ createdAt: -1 })
.limit(20)
.explain("executionStats");
```

### Critical Metrics Checklist

| Metric | Target Ideal | Critical Warning Signs |
| :--- | :--- | :--- |
| **`stage`** | `IXSCAN` followed by `FETCH` (or `PROJECTION_COVERED`) | `COLLSCAN` (full scan), `SORT` (in-memory sort), `SUBPLAN` (multiple disparate index scans). |
| **`totalDocsExamined`** | Equal to `nReturned` | Much higher than `nReturned` (e.g. examined 50,000 documents to return 20). |
| **`totalKeysExamined`** | Equal to `nReturned` | Vastly exceeds `nReturned` (index is scanning many keys that fail later predicate checks). |
| **`nReturned`** | Number of documents requested | Disproportionate compared to docs examined. |
| **`executionStages.hasSortStage`** | `false` | `true` (indicates in-memory sort; index does not cover sort order). |
| **`executionTimeMillis`** | < 10ms for OLTP queries | > 100ms indicates index scan inefficiency or disk thrashing. |

---

## 2. Diagnosing Common Execution Stages

### Stage: `COLLSCAN` (Collection Scan)
- **What it means**: MongoDB read every single document in the collection from disk/cache to evaluate the filter.
- **Remedy**: Create a compound index covering the filter predicates following the ESR rule.

### Stage: `IXSCAN` (Index Scan)
- **What it means**: MongoDB navigated a B-tree index to locate candidate documents.
- **Healthy Sub-metrics**: Check `indexName`, `direction: "forward"`, and `keyBounds`.

### Stage: `FETCH`
- **What it means**: MongoDB retrieved the full document body from the collection using the disk pointers returned by the `IXSCAN`.
- **Optimization**: If latency is critical, project only indexed fields to convert the query into a **Covered Query**, eliminating the `FETCH` stage entirely.

### Stage: `SORT`
- **What it means**: MongoDB performed a blocking in-memory sort.
- **Fatal Risk**: If the data to be sorted in memory exceeds **100MB**, the query aborts with an error:
  `Executor error during find command :: caused by :: Sort exceeded memory limit of 104857600 bytes`.
- **Remedy**: Place the sort field before range fields in the compound index (ESR Rule).

---

## 3. Achieving Covered Queries (`totalDocsExamined: 0`)

A covered query is the fastest possible operation in MongoDB because the storage engine satisfies both the predicate and projection strictly from the index.

### Recipe:
```javascript
// Step 1: Create compound index containing ALL query fields AND projected fields
db.users.createIndex(
  { organizationId: 1, email: 1, role: 1 },
  { name: "idx_users_covered_lookup" }
);

// Step 2: Query specifying exact projection, explicitly excluding _id
db.users.find(
  { organizationId: "org_99", email: "alice@acme.com" },
  { _id: 0, organizationId: 1, email: 1, role: 1 } // Only indexed fields!
);

// Step 3: Verify with explain
const plan = db.users.find(
  { organizationId: "org_99", email: "alice@acme.com" },
  { _id: 0, organizationId: 1, email: 1, role: 1 }
).explain("executionStats");

print("Total Docs Examined:", plan.executionStats.totalDocsExamined); // MUST BE 0
print("Stage:", plan.executionStats.executionStages.stage);           // PROJECTION_COVERED
```

---

## 4. Detecting Slow Queries with the Database Profiler

To capture and log slow queries in non-production or staging environments:

```javascript
// Set profiling level to 1 (capture operations exceeding threshold)
db.setProfilingLevel(1, { slowms: 50 }); // Log queries taking > 50ms

// Query the system.profile collection for slow operations
db.system.profile.find({
  ns: "my_database.orders",
  millis: { $gt: 50 }
})
.sort({ ts: -1 })
.limit(10)
.forEach(entry => {
  print(`[SLOW QUERY] ${entry.millis}ms | Op: ${entry.op} | Query: ${JSON.stringify(entry.command)}`);
});
```
