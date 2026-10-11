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
   - Never rely solely on application-layer or ORM/ODM validations (Mongoose, Spring Data) to safeguard data integrity.
   - Schema modifications must be applied deterministically through versioned migrations via `collMod`.

2. **Strict BSON Data Typing & Financial Precision**:
   - Never store currency or precise decimals as floating-point `Double`; mandate BSON `Decimal128` or minor-unit integers.
   - Store all dates and timestamps as native BSON `Date` objects in UTC; never use formatted strings.
   - Store UUIDs with standard BSON binary representation (`uuidRepresentation: 'standard'`) or explicit strings.

3. **Anti-Pattern Ban: Unbounded Document Growth & Inlined Array Bloat**:
   - Never allow documents or inlined arrays to grow without an upper bound (the 16MB BSON limit).
   - For 1:N relationships where N exceeds 100 or grows continuously, mandate the **Bucket Pattern**, **Subset Pattern**, or explicit referencing (`foreignField`).

4. **The Golden ESR Rule (Equality, Sort, Range) for Compound Indexes**:
   - Order compound index keys strictly by ESR: **E**quality fields first, **S**ort fields second, **R**ange/inequality fields last.
   - Multi-field sort directions must match the index order or its inverse; compound indexes must contain at most one array field.
   - Maximize covered queries (`totalDocsExamined: 0`) on latency-critical paths by projecting only indexed fields.

5. **Diagnostic Profiling & Elimination of Production `COLLSCAN`**:
   - Never deploy unindexed collection scans (`COLLSCAN`) on production collections with > 1,000 documents; validate queries with `explain("executionStats")`.
   - Eliminate in-memory sort spills (`hasSortStage: true` without index backing) to avoid 100MB RAM exhaustion errors.
   - Absolute ban on unindexed leading-wildcard regular expressions (`/.*search/`) and arbitrary JavaScript execution via `$where`.

6. **Resilient Connection Pooling & Majority Concerns**:
   - Instantiate `MongoClient` as a process-wide singleton; never open connections per request or function call.
   - Bound connection pools (`maxPoolSize: 50-100`, `maxConnecting: 2-5`) to prevent connection storms.
   - Production mutations MUST use write concern `w: "majority"` with `j: true`; use `readConcern: "majority"` and causal consistency for critical reads.

7. **Multi-Document ACID Transactions vs. Single-Document Atomicity**:
   - Model document schemas to maximize single-document atomicity; reserve multi-document transactions (`session.withTransaction`) strictly for cross-collection business invariants.
   - Transactional blocks must implement automatic retry loops for `TransientTransactionError` and `UnknownTransactionCommitResult`.

8. **Automated & Idempotent Migrations with `migrate-mongo`**:
   - Automate database evolution with versioned, sequential migration scripts exporting idempotent `up(db, client)` and `down(db, client)` functions.
   - Enforce distributed mutual exclusion via `lockCollectionName: "changelog_lock"` with a positive TTL (e.g. `lockTtl: 300`).
   - Absolute ban on `lockTtl: 0`, which silently disables distributed locking entirely.

9. **Zero-Downtime Migration Choreography (Expand/Contract & Batching)**:
   - High-traffic schema changes must follow the Expand/Contract (Parallel Run) pattern across deployment phases.
   - Historical data backfills must use streaming cursors (`cursor.batchSize(500)`) and unordered `bulkWrite`; never load collections with `find().toArray()`.
   - Build production indexes online or via rolling replica builds before querying against them.

10. **Mandatory Dedicated `README.md` Living Runbook for Migrations**:
    - Every directory housing migration scripts (e.g., `migrations/`) MUST maintain an up-to-date `README.md` documenting architecture, migrations catalog matrix, CLI/Docker recipes, environment contracts, and rollbacks.
    - Synchronize this `README.md` within the exact same atomic commit whenever migrations, schemas, or indexes change.

11. **Zero Hardcoded Secrets & Dynamic Environment Decoupling**:
    - Never commit connection strings, credentials, or fallback database names in `migrate-mongo-config.js` or source code.
    - Configuration files MUST resolve credentials dynamically at runtime via environment variables (`MIGRATE_MONGO_URI`, `MONGODB_URI`) and supply a documented `.env.example`.

12. **Containerized Migration Execution & Healthcheck Orchestration**:
    - Containerize migrations using dedicated minimal Dockerfiles (`Dockerfile.migrate-mongo`) running as unprivileged users.
    - Declare operational MongoDB healthchecks in `compose.yaml` via `mongosh` (`test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]`).
    - Dependents must declare `condition: service_healthy` for MongoDB and `condition: service_completed_successfully` for migration runners before application startup.

---

Consult the corresponding specialized skills for comprehensive architectural patterns, code blueprints, configuration templates, and testing runbooks.
