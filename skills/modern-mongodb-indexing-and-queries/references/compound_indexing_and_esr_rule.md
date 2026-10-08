# Compound Indexing Mechanics & The ESR Rule

Compound indexes contain references to multiple fields within a document collection. In high-scale MongoDB deployments, compound index structure directly dictates query latency, memory consumption, and concurrency throughput.

---

## 1. The Mathematical Mechanics of the ESR Rule

The **Equality, Sort, Range (ESR)** rule is the fundamental guideline for constructing compound indexes in MongoDB:

### E: Equality First
- Fields that use exact scalar equality matches (`{ field: "value" }` or `{ field: { $eq: "value" } }`).
- Placing Equality fields first narrows down the candidate B-tree index space to an exact, contiguous leaf segment.
- If multiple equality fields exist, place the field with highest cardinality first for readability (though MongoDB's index scanner evaluates equality fields in any order within contiguous keys).

### S: Sort Second
- Fields specified in the query's `.sort({ field: 1 })` clause.
- Placing the Sort field immediately after Equality fields ensures that all index entries matching the equality criteria are encountered in pre-sorted physical order.
- This allows MongoDB to stream the results directly to the caller, completely eliminating the need for a memory-intensive, blocking sort phase.

### R: Range Last
- Fields filtered with range or inequality operators: `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$ne`, or regex prefix filters.
- Once the index scanner encounters a range condition, the scan must traverse across multiple branches of the B-tree. If a sort key were placed *after* a range key, index entries would not be in sorted order for the remaining fields, forcing an in-memory sort.

### Concrete Comparative Walkthrough

Consider the query:
```javascript
db.users.find({ country: "US", age: { $gte: 21 } }).sort({ signupDate: -1 });
```

| Candidate Index | Order Classification | Execution Path | Performance Outcome |
| :--- | :--- | :--- | :--- |
| `{ country: 1, age: 1, signupDate: -1 }` | **E -> R -> S** *(Violates ESR)* | Scans `country: "US"`, then scans all index entries with `age >= 21`. Because multiple ages exist, `signupDate` entries are scattered across different age ranges. MongoDB MUST load all matching keys into RAM and execute a blocking **in-memory sort**. | High CPU, high latency, fails on collections > 100MB of matched data. |
| `{ country: 1, signupDate: -1, age: 1 }` | **E -> S -> R** *(Strict ESR)* | Scans `country: "US"`, immediately traverses index keys in descending `signupDate` order. Checks `age >= 21` on each index entry. **Zero in-memory sort** (`hasSortStage: false`). Results stream instantly. | Optimal (sub-millisecond latency, zero memory spill). |

### Sort Direction Collinearity in Compound Indexes
In a single-field index, the sort direction (`1` vs `-1`) does not matter because MongoDB traverses single-field B-trees forwards or backwards with equal efficiency. 

However, in **compound indexes with multiple sort keys**, the sort directions matter immensely:
- An index defined as `{ a: 1, b: -1 }` supports:
  - `.sort({ a: 1, b: -1 })` (exact match: index scanned forward)
  - `.sort({ a: -1, b: 1 })` (inverse match: index scanned backward)
- **It DOES NOT support**:
  - `.sort({ a: 1, b: 1 })`
  - `.sort({ a: -1, b: -1 })`
- *Failure Mode*: When sort directions do not match the index direction or its exact inverse, MongoDB **cannot** use the index to fulfill the sort order and is forced to perform a blocking **in-memory sort** (`hasSortStage: true`), risking the 100MB RAM spill limit.

### Restriction: The Parallel Multikey Array Constraint
In MongoDB, a compound index can contain **at most ONE array (multikey) field**:
- Indexing `{ tags: 1, categories: 1 }` will fail on insertion of any document that contains an array in both `tags` and `categories`:
  `cannot index parallel arrays [tags] [categories]`
- *Why*: Indexing parallel arrays creates a Cartesian product of index entries ($N \times M$), leading to combinatorial explosion of B-tree entries.
- *Solution*: If both fields must be queried together, model one field as a scalar (e.g. single primary category), or use an associative subdocument structure (e.g. `items: [{ tag, category }]`).

---

## 2. Index Prefixes & Redundancy Elimination

A compound index on `{ a: 1, b: 1, c: 1 }` supports queries matching any left-anchored prefix of that index:
- `{ a: 1 }` (prefix supported)
- `{ a: 1, b: 1 }` (prefix supported)
- `{ a: 1, b: 1, c: 1 }` (full index supported)

### Anti-Pattern: Redundant Index Waste
If you have created `{ a: 1, b: 1, c: 1 }`, you DO NOT need:
- An index on `{ a: 1 }`
- An index on `{ a: 1, b: 1 }`

**Why redundant indexes are toxic**:
Every additional index consumes WiredTiger RAM cache and degrades `insert`, `update`, and `delete` write throughput, because every write must update all associated B-tree indexes under storage engine locks.

---

## 3. Specialized Index Architectures

### A. Partial Indexes (`partialFilterExpression`)
Index only documents that meet a specific filter criterion, drastically cutting RAM footprint:

```javascript
// Index only active user emails for login lookups
db.users.createIndex(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
    name: "idx_active_users_email_unique"
  }
);
```

### B. TTL Indexes (`expireAfterSeconds`)
Automatically deletes documents when an indexed date field reaches a specified age:

```javascript
// Automatically purge expired OAuth sessions 3600 seconds after 'createdAt'
db.sessions.createIndex(
  { createdAt: 1 },
  {
    expireAfterSeconds: 3600,
    name: "idx_sessions_ttl"
  }
);
```
*Rule*: The indexed field MUST contain a BSON `Date` object. If the field is missing or contains a string, the TTL monitor ignores the document.

### C. Wildcard Indexes (`$**`)
For polymorphic documents or dynamic key-value attributes (e.g., product attributes, telemetry):

```javascript
// Index all paths under the 'customMetadata' subdocument
db.products.createIndex(
  { "customMetadata.$**": 1 },
  { name: "idx_products_metadata_wildcard" }
);
```

### D. Collation-Aware Indexes
For case-insensitive or locale-aware string matching without storing duplicated lowercased fields:

```javascript
db.customers.createIndex(
  { username: 1 },
  {
    collation: { locale: "en", strength: 2 }, // strength 2 ignores case
    name: "idx_customers_username_case_insensitive"
  }
);
```
*Rule*: Queries must pass the exact same collation options to utilize the index.

---

## 4. Hidden Indexes (`hideIndex` / `unhideIndex`)

Introduced in modern MongoDB, hidden indexes allow operations teams to evaluate the impact of dropping an index without permanently destroying it:

```javascript
// Step 1: Hide the index from query planner
db.orders.hideIndex("idx_orders_legacy_lookup");

// Step 2: Observe query performance and system.profile for 48 hours.
// If query performance degrades, unhide it immediately without a re-build:
db.orders.unhideIndex("idx_orders_legacy_lookup");

// Step 3: If no regressions are detected, permanently drop the index:
db.orders.dropIndex("idx_orders_legacy_lookup");
```
