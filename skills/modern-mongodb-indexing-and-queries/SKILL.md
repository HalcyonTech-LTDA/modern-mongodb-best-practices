---
name: modern-mongodb-indexing-and-queries
description: >-
  Use this skill when designing indexes or optimizing queries and aggregations in MongoDB:
  compound indexes and the ESR Rule (Equality, Sort, Range), covered queries, partial & TTL indexes,
  hidden indexes for safe deprecation, explain("executionStats") diagnostics, COLLSCAN elimination,
  and aggregation pipeline performance optimization.
---

# Modern MongoDB Indexing & Query Performance

This skill provides comprehensive architectural guidelines, mathematical index ordering rules, query diagnostics, and aggregation pipeline optimization patterns for modern MongoDB (6.0+, 7.0+, 8.0+).

---

## Core Principles

1. **The Golden ESR Rule (Equality, Sort, Range)**:
   - For all multi-field compound indexes, order the index keys strictly according to the **ESR Rule**:
     1. **E - Equality**: Fields with exact-match predicates (`{ status: "ACTIVE", tenantId: "tenant_42" }`) MUST come first.
     2. **S - Sort**: Fields determining sort order (`sort({ createdAt: -1 })`) MUST come second.
     3. **R - Range / Multikey**: Fields with inequality or range filters (`{ price: { $gte: 100 }, tags: { $in: ["electronics"] } }`) MUST come last.
   - **Why this is critical**: Placing range fields before sort fields forces MongoDB to inspect range matches across multiple index leaf branches and perform an **in-memory blocking sort** (`hasSortStage: true`), which fails at 100MB and degrades CPU throughput. Following ESR enables MongoDB to stream index entries in sorted order with zero in-memory sort.

2. **Index Selectivity & Cardinality**:
   - High-selectivity fields (fields containing many unique values, e.g., `userId`, `email`, `orderId`) filter out documents much faster than low-selectivity fields (e.g., `boolean` flags, status enums with 3 values).
   - In equality predicates, combine high-cardinality fields first to minimize candidate documents immediately.

3. **Covered Queries (`totalDocsExamined: 0`)**:
   - A query is **covered** when:
     1. All query filter fields are in an index.
     2. All returned/projected fields are in that same index.
     3. The `_id` field is explicitly excluded (`{ _id: 0 }`), unless `_id` is part of the index.
   - Covered queries do not touch the collection data files on disk or in the WiredTiger cache. They execute entirely in-memory within the B-tree index, delivering sub-millisecond response times.

4. **Specialized Index Types**:
   - **Partial Indexes (`partialFilterExpression`)**: Index only documents matching a specific predicate. Reduces index size on disk and in RAM by 80%+ (e.g., index `email` only where `status: "ACTIVE"`, or index `scheduledAt` only where `processed: false`).
   - **TTL Indexes (`expireAfterSeconds`)**: Automatically purge ephemeral documents (user sessions, auth tokens, cache items) after a defined duration without application crons.
   - **Wildcard Indexes (`$**`)**: Efficiently index unstructured or dynamic attributes without defining hundreds of distinct indexes.
   - **Hidden Indexes (`hideIndex()`)**: Hide an index from the query planner to evaluate query performance impact before permanently dropping it in production.

5. **Diagnostic Discipline with `explain("executionStats")`**:
   - Never release a high-throughput query to production without reviewing its `explain("executionStats")`.
   - **Zero `COLLSCAN` Rule**: Production collections with > 1,000 documents must NEVER execute a full collection scan (`COLLSCAN`).
   - **Efficiency Ratio**: Aim for `totalDocsExamined / nReturned` ratio of `1.0`. Ratios above `5.0` indicate index inefficiency; ratios above `100` indicate critical index misconfiguration.

6. **Aggregation Pipeline Craftsmanship**:
   - **Early Filtering**: Always place `$match` and `$limit` at the very beginning of the pipeline. MongoDB pushes `$match` down to the storage engine to use indexes before document serialization.
   - **Project Early**: Use `$project` or `$unset` to drop unneeded heavy arrays and fields before `$group` or `$lookup` stages to stay well below the 100MB internal RAM stage limit.
   - **Index Backing for `$lookup`**: Ensure the `foreignField` on the foreign collection has an index. Unindexed `$lookup` performs a full collection scan on every matched parent document (quadratic $O(N \times M)$ complexity).

---

## Detailed Topic Guides

1. **Compound Indexing & The ESR Rule**:
   - Deep mathematical mechanics of the ESR Rule.
   - Index prefixes and compound index reuse.
   - Partial, TTL, Wildcard, and Collation-aware indexes.
   - Hidden indexes for safe deprecation workflows.
   - [Read Guide](./references/compound_indexing_and_esr_rule.md)

2. **Query Profiling & Explain Plan Diagnostics**:
   - Analyzing `explain("executionStats")`.
   - Identifying and resolving `COLLSCAN`, in-memory sort spills (`hasSortStage`), and multikey explosions.
   - Achieving covered queries.
   - MongoDB Database Profiler (`system.profile`) for slow query detection.
   - [Read Guide](./references/query_optimization_and_explain_plans.md)

3. **Aggregation Pipeline Craftsmanship**:
   - Aggregation stage choreography and pipeline optimization.
   - RAM limits (100MB stage limit) and `allowDiskUse` discipline.
   - High-performance `$lookup` foreign joins.
   - Streaming aggregations vs memory-accumulating stages.
   - [Read Guide](./references/aggregation_pipeline_craftsmanship.md)

---

## Blueprint Example: Applying the ESR Rule

### Scenario
An e-commerce application executes the following frequent query:
```javascript
db.orders.find({
  tenantId: "acme_corp",                          // Equality: Exact match
  status: "PAID",                                  // Equality: Exact match
  orderDate: { $gte: ISODate("2026-09-01T00:00:00Z") } // Range: Inequality filter
})
.sort({ amount: -1 })                              // Sort: Descending order
.limit(20);
```

### Fragile Index (Violates ESR):
```javascript
// ANTIPATTERN: Range placed before Sort
db.orders.createIndex({ tenantId: 1, status: 1, orderDate: 1, amount: -1 });
// Result: MongoDB scans the orderDate range across multiple branches,
// then has to perform a blocking IN-MEMORY SORT on amount!
```

### Production Index (Strict ESR Compliance):
```javascript
// CORRECT: Equality (tenantId, status) -> Sort (amount) -> Range (orderDate)
db.orders.createIndex(
  { tenantId: 1, status: 1, amount: -1, orderDate: 1 },
  { name: "idx_orders_tenant_status_amt_date" }
);
// Result: MongoDB walks the index directly in sorted 'amount' order,
// filters 'orderDate' on the fly, stops immediately at limit(20),
// and performs ZERO in-memory sort!
```
