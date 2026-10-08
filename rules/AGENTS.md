---
description: >-
  Automatically enforces modern MongoDB engineering standards: schema design & data modeling patterns,
  declarative JSON Schema validation ($jsonSchema), BSON typing hygiene (Decimal128, UTC dates), compound indexing & ESR rule,
  query diagnostics (explain executionStats, zero COLLSCAN), connection pooling & majority concerns, multi-document ACID transactions,
  zero-downtime migrations with migrate-mongo, and mandatory dedicated living README.md runbook documentation.
trigger: model_decision
---

# Modern MongoDB Engineering Guardrails & Skill Router

When architecting, querying, indexing, configuring, containerizing, or migrating MongoDB databases and data models, strictly adhere to Modern MongoDB Engineering Standards and the corresponding specialized skills:

| When working on... | Consult & Activate Skill | Key Focus Areas |
| :--- | :--- | :--- |
| **Schema Design & Data Modeling** | `modern-mongodb-data-modeling` | Embedding vs referencing trade-offs, document growth boundaries (16MB limit), advanced schema patterns (Bucket, Subset, Polymorphic, Attribute, Extended Reference, Schema Versioning), declarative `$jsonSchema` validation, and strict BSON typing (`Decimal128`, UTC `Date`, standard UUIDs). |
| **Indexing & Query Performance** | `modern-mongodb-indexing-and-queries` | Compound indexing and the ESR Rule (Equality, Sort, Range), covered queries (`totalDocsExamined: 0`), partial and TTL indexes, wildcard indexing, hidden indexes for safe migration, diagnostic profiling (`explain("executionStats")`), `COLLSCAN` elimination, and aggregation pipeline optimization. |
| **Resilience, Topology & Operations** | `modern-mongodb-resilience-and-ops` | Singleton `MongoClient` lifecycle, connection pool sizing, write concerns (`w: "majority"`, `j: true`), read concerns (`majority`, linearizable), causal consistency sessions, multi-document ACID transactions with transient error retries, container healthchecks, and RBAC least privilege. |
| **Migrations, Schema Evolution & Runbooks** | `modern-mongodb-migrations-and-lifecycle` | Declarative migration lifecycle with `migrate-mongo`, dynamic zero-secret configuration, distributed mutual exclusion locks (`changelog_lock`), zero-downtime Expand/Contract patterns, batched cursor `bulkWrite` execution, containerized migration runners, and the **mandatory dedicated `README.md` living runbook**. |

---

## Non-Negotiable Guardrails (Absolute Invariants)

1. **Mandatory Declarative Collection Schema Validation (`$jsonSchema`)**:
   - Every production collection MUST define server-side schema validation using `$jsonSchema` with `validationLevel: "strict"` and `validationAction: "error"`.
   - Never rely solely on application-layer or ORM/ODM validations (e.g., Mongoose, Spring Data) to safeguard data integrity. The database itself must reject malformed documents, unexpected field types, or missing required attributes.
   - Schema modifications must be applied deterministically through versioned migrations via `collMod`.

2. **Strict BSON Data Typing & Financial Precision**:
   - **Absolute Ban on Floating-Point `Double` for Currency**: Monetary values, financial transactions, and precise decimals MUST use BSON `Decimal128` (or an integer representation in the smallest currency unit). Never store currency as IEEE 754 floating-point numbers.
   - **Timestamps**: All dates and timestamps MUST be stored as native BSON `Date` objects in UTC. Never store timestamps as formatted strings (e.g., `"2026-10-08T12:00:00Z"`).
   - **UUIDs**: UUID fields MUST be stored with standard BSON binary representation (`uuidRepresentation: 'standard'`) or explicit strings, avoiding legacy driver-specific BSON subtype mismatches.

3. **Anti-Pattern Ban: Unbounded Document Growth & Inlined Array Bloat**:
   - Never allow documents or inlined arrays to grow without an upper bound (the "unbounded array" antipattern). Storing hundreds of thousands of subdocuments inside a single parent array risks the 16MB BSON document limit and triggers costly disk re-allocation penalties during document expansion.
   - For 1:N relationships where N exceeds 100 or grows continuously over time (e.g., order events, log entries, time-series data, user activity), apply the **Bucket Pattern**, **Subset Pattern**, or model with explicit parent referencing (`foreignField`).

4. **The Golden ESR Rule (Equality, Sort, Range) for Compound Indexes**:
   - Compound indexes MUST follow the **ESR Rule** for query predicate ordering:
     1. **E (Equality)**: Fields queried with exact match (`$eq`, literal scalar) come first.
     2. **S (Sort)**: Fields specifying the sort order (`sort()`) come second.
     3. **R (Range / Multikey)**: Fields filtered with inequality/range operators (`$gt`, `$lt`, `$in`, regex) come last.
   - Placing range fields before sort fields forces MongoDB to perform a blocking in-memory sort instead of an index-assisted stream.
   - **Sort Direction Collinearity**: For multi-field sorts, the sort directions (`1` or `-1`) MUST match the index direction or its exact inverse (e.g., index `{ a: 1, b: -1 }` supports sort `{ a: 1, b: -1 }` and `{ a: -1, b: 1 }`, but causes an in-memory sort for `{ a: 1, b: 1 }`).
   - **Absolute Ban on Parallel Multikey Arrays**: A compound index MUST contain at most ONE array field. MongoDB rejects indexing multiple array fields with the fatal error `cannot index parallel arrays`.
   - Maximize **Covered Queries** (`totalDocsExamined: 0`) for latency-critical paths by projecting only indexed fields.

5. **Diagnostic Profiling & Elimination of Production `COLLSCAN`**:
   - Never introduce queries or aggregation stages in production that perform unindexed collection scans (`COLLSCAN`) on collections containing more than 1,000 documents.
   - All high-frequency queries MUST be validated with `explain("executionStats")`. The ratio of `totalKeysExamined` and `totalDocsExamined` to `nReturned` must approach 1:1.
   - Eliminate in-memory sort spills (`hasSortStage: true` without index backing). If a query sorts without an index and exceeds the 100MB internal memory threshold, it fails with an error.
   - Absolute ban on unindexed leading-wildcard regular expressions (e.g., `/.*search/`) and `$where` arbitrary JavaScript execution.

6. **Resilient Connection Pooling & Majority Concerns**:
   - **Client Lifecycle**: `MongoClient` must be instantiated as a process-wide singleton. Never instantiate a new client per incoming HTTP request or function call.
   - **Connection Pool Bounds**: Configure `maxPoolSize` (typically 50-100 per instance) and `maxConnecting` (typically 2-5) to prevent connection storms and resource exhaustion during service restarts.
   - **Write Concern**: Production state mutations MUST use write concern `w: "majority"` with `j: true` (journaled) to guarantee durability and prevent rollback in the event of primary election failovers.
   - **Read Concern**: High-integrity reads MUST declare `readConcern: "majority"` to prevent dirty reads of uncommitted primary writes.
   - **Causal Consistency**: Use causal consistency sessions (`client.startSession({ causalConsistency: true })`) to ensure monotonic read-after-write consistency across replica set secondaries.

7. **Multi-Document ACID Transactions vs. Single-Document Atomicity**:
   - Model document schemas to maximize single-document atomicity (which is natively atomic and lock-free in MongoDB). 95%+ of transactional operations should be resolved within a single document hierarchy.
   - Reserve multi-document ACID transactions (`session.withTransaction(...)`) exclusively for cross-collection business invariants (e.g., balance transfers, inventory reservations across decoupled collections).
   - All transactional blocks MUST implement automatic retry loops for `TransientTransactionError` and `UnknownTransactionCommitResult`.

8. **Automated & Versioned Database Migrations with `migrate-mongo`**:
   - Every MongoDB database evolution MUST be automated, versioned, and tracked through declarative migration scripts using [**migrate-mongo**](https://www.npmjs.com/package/migrate-mongo).
   - Migration files MUST be timestamped, sequential, and export asynchronous `up(db, client)` and `down(db, client)` functions.
   - Migrations MUST be designed to be strictly **idempotent**: running an already-applied migration must not crash or corrupt state.
   - **Distributed Locking & Absolute Ban on `lockTtl: 0`**:
     - Migrations MUST declare a distributed lock via `lockCollectionName: "changelog_lock"` with a positive TTL (e.g. `lockTtl: 300`).
     - **Absolute Ban on `lockTtl: 0`**: In `migrate-mongo`, setting `lockTtl: 0` silently disables distributed locking entirely, exposing concurrent deployments to race conditions. A positive TTL guarantees mutual exclusion and automatically cleans up stale locks if a runner process crashes.

9. **Zero-Downtime Migration Choreography (Expand/Contract & Batching)**:
   - Schema modifications on high-traffic production databases MUST follow the **Expand/Contract Pattern (Parallel Run)**:
     1. *Phase 1 (Expand)*: Add new fields/structures; application writes to both old and new schema.
     2. *Phase 2 (Migrate)*: Backfill historical data in background batched chunks using cursor iteration (`cursor.batchSize(500)`) and unordered `bulkWrite()`. Never load entire collections into memory with `find().toArray()`.
     3. *Phase 3 (Contract)*: Shift reads and writes exclusively to the new schema; deprecate and prune legacy fields.
   - Create production indexes in the background or via rolling replica builds to avoid blocking write operations on older MongoDB versions.

10. **Mandatory Dedicated `README.md` Living Runbook for Migrations**:
    - Every directory or project module housing database migration scripts (e.g., `migrate-mongo/`, `migrations/`, `db/migrations/`) **MUST** maintain a dedicated, up-to-date `README.md` located directly in that migration root directory.
    - Any pull request or commit that introduces, alters, or removes migration scripts, indexes, configuration, or CLI options **MUST** synchronize this `README.md` within the exact same atomic commit.
    - The `README.md` must document:
      - The target database and collection architecture.
      - A comprehensive **Active Migrations Catalog Matrix** table mapping migration scripts, descriptions, affected collections, and structural/index mutations.
      - Execution runbook covering local CLI (`migrate-mongo up`), task runners (Taskfile/Makefile), Docker Compose, and standalone CI container execution.
      - Dynamic environment variable contract table with strict placeholder reference (zero hardcoded defaults or credentials).
      - Step-by-step verification commands via `mongosh` (verifying `changelog` and `getIndexes()`).
      - Rollback and disaster recovery procedures (`migrate-mongo down`).

11. **Zero Hardcoded Secrets & Dynamic Environment Decoupling**:
    - Never commit connection strings containing credentials, plaintext passwords, or auth tokens inside `migrate-mongo-config.js`, application source files, or Dockerfiles.
    - Configuration files MUST resolve credentials dynamically at runtime exclusively via environment variables (`MIGRATE_MONGO_URI`, `MONGODB_URI`).
    - Banned: Fallback hardcoding of sensitive connection strings or local database names (e.g., `process.env.DB_URI || 'mongodb://root:secret@localhost:27017/prod_db'`). Provide a documented `.env.example` file defining all required environment variable keys.

12. **Containerized Migration Execution & Healthcheck Orchestration**:
    - Database migrations MUST be containerized using a dedicated, hardened Dockerfile (e.g., `Dockerfile.migrate-mongo`) leveraging minimal base images (Alpine or Distroless), unprivileged users (`USER node` or `USER 10001:10001`), and JSON exec form.
    - In `compose.yaml`, MongoDB services MUST declare an operational healthcheck using `mongosh` (`test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]`).
    - Migration container services MUST declare `depends_on: { mongodb: { condition: service_healthy } }`.
    - Application services MUST declare `depends_on: { migrate-mongo: { condition: service_completed_successfully } }` to ensure all migrations finish successfully before the application starts up.

---

Consult the corresponding skills for complete technical deep dives, configuration recipes, schema patterns, and reference implementations.
