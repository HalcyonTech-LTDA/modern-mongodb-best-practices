# Aggregation Pipeline Craftsmanship & Optimization

The MongoDB Aggregation Framework is a powerful data processing engine. However, poorly structured pipelines cause heavy CPU overhead, memory exhaustion, and slow response times. Modern aggregation engineering requires strict stage ordering, memory limit discipline, and index utilization.

---

## 1. Stage Sequencing & Pipeline Optimization Principles

### Rule 1: Push `$match` and `$limit` to the Beginning
- If `$match` is the first stage in a pipeline, MongoDB evaluates it against an index using an `IXSCAN`.
- Moving `$match` after a `$project`, `$group`, or `$unwind` forces MongoDB to scan and transform every document in the collection before filtering, destroying index usage.

### Rule 2: Project Out Unneeded Fields Before Heavy Stages
- Use `$project` or `$unset` early to strip away large embedded documents, binary payloads, and arrays before stages like `$group`, `$sort`, or `$lookup`.
- Reduces the working set size kept in memory and avoids the 100MB per-stage RAM limit.

### Rule 3: Minimize `$unwind` Overhead
- `$unwind` deconstructs an array of $N$ elements into $N$ distinct documents.
- If an array contains 50 items and you unwind 100,000 documents, the pipeline instantly expands to 5,000,000 documents in memory.
- Filter before unwinding (`$match` with `$elemMatch` or early predicate), or use array expressions (`$filter`, `$map`, `$reduce`) instead of full unwinding whenever possible.

---

## 2. Managing Memory Limits (The 100MB RAM Guardrail)

Each stage in an aggregation pipeline has a strict **100MB RAM limit** by default. If a blocking stage (e.g., `$sort` or `$group`) exceeds 100MB of working memory:
- By default, the query aborts with an error:
  `QueryExceededMemoryLimitNoDiskUseAllowed: Sort exceeded memory limit...`

### The `allowDiskUse` Discipline:
- In production OLTP APIs: **DO NOT** use `allowDiskUse: true` as a crutch for missing indexes. Spilling to temporary disk files causes dramatic latency spikes (seconds instead of milliseconds) and saturates storage I/O.
- Instead, optimize the query: back the `$sort` stage with a compound index following ESR, or filter down candidate documents using `$match`.
- **Top-K Heapsort Coalescence**: When `$sort` is immediately followed by `$limit`, MongoDB optimizer coalesces the two stages into a bounded top-k heap, consuming memory proportional only to the limit count rather than the entire dataset.
- `allowDiskUse: true` is permissible **solely** for offline analytics, nightly ETL batches, or asynchronous reporting jobs.

### Modern Analytic Windows (`$setWindowFields`)
In modern MongoDB (5.0+, 6.0+, 7.0+, 8.0+), avoid running self-referencing `$lookup` queries or external aggregations to compute running totals, rolling averages, or document rankings. Use the native `$setWindowFields` stage:
```javascript
db.sales.aggregate([
  {
    $setWindowFields: {
      partitionBy: "$region",
      sortBy: { orderDate: 1 },
      output: {
        cumulativeRevenue: {
          $sum: "$amount",
          window: { documents: ["unbounded", "current"] }
        }
      }
    }
  }
]);
```

---

## 3. High-Performance `$lookup` Foreign Joins

The `$lookup` stage performs an equality join across collections.

### Fragile Pattern: Unindexed `$lookup`
```javascript
// ANTIPATTERN: 'customerId' in 'orders' has NO index
db.customers.aggregate([
  { $match: { tier: "VIP" } },
  {
    $lookup: {
      from: "orders",
      localField: "_id",
      foreignField: "customerId",
      as: "customerOrders"
    }
  }
]);
```
*Why it fails*: For every customer matched, MongoDB runs a full `COLLSCAN` on the entire `orders` collection! If 1,000 customers match and `orders` has 1,000,000 documents, this performs 1 billion document inspections.

### Modern Pattern: Index-Backed Correlated Pipeline Join
```javascript
// REQUIREMENT: Ensure an index exists on { customerId: 1, createdAt: -1 } in 'orders'
db.customers.aggregate([
  { $match: { tier: "VIP" } },
  {
    $lookup: {
      from: "orders",
      let: { custId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$customerId", "$$custId"] }
          }
        },
        { $sort: { createdAt: -1 } },
        { $limit: 5 }, // Only fetch 5 recent orders per VIP
        {
          $project: {
            _id: 1,
            orderNumber: 1,
            grandTotal: 1,
            createdAt: 1
          }
        }
      ],
      as: "recentOrders"
    }
  }
]);
```

---

## 4. Aggregation Explain Plans

To verify how the optimizer transforms and executes a pipeline:

```javascript
db.orders.explain("executionStats").aggregate([
  { $match: { status: "DELIVERED" } },
  { $group: { _id: "$customer.id", totalSpent: { $sum: "$pricing.grandTotal" } } },
  { $sort: { totalSpent: -1 } },
  { $limit: 10 }
]);
```

Check:
1. Did the first stage execute as an `IXSCAN`?
2. Did `$match` and `$sort` merge or leverage index ordering?
3. What is the peak memory usage reported in `executionStats`?
