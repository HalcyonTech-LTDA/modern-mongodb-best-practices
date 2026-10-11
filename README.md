# Modern MongoDB Best Practices Plugin

An Antigravity plugin providing automated engineering guardrails, architectural patterns, indexing disciplines, connection resilience standards, zero-downtime database migrations with [**migrate-mongo**](https://www.npmjs.com/package/migrate-mongo), and the **mandatory living `README.md` runbook documentation discipline** for modern MongoDB (6.0+, 7.0+, 8.0+).

---

## Installation

Install directly in Antigravity via the CLI:

```bash
agy plugin install https://github.com/HalcyonTech-LTDA/modern-mongodb-best-practices
```

Verify that the plugin is installed and ready:

```bash
agy plugin list
```

---
## Overview

In modern cloud-native systems, microservices, and distributed applications, MongoDB is frequently chosen for its flexible document model, horizontal scalability, and developer velocity. However, without strict architectural discipline, MongoDB implementations often deteriorate into critical production failure modes:

- **The "Schemaless" Antipattern**: Treating MongoDB as an unvalidated dumping ground, leading to corrupted data types, missing required attributes, and broken polyglot microservice contracts.
- **Unbounded Document Growth**: Pushing unlimited subdocuments into inlined arrays, triggering constant disk re-allocations and eventually crashing into the hard 16MB BSON document limit.
- **Full Collection Scans (`COLLSCAN`) & In-Memory Sort Spills**: Writing queries without proper compound indexes or violating the **ESR Rule** (Equality, Sort, Range), resulting in 100MB RAM sort errors and high CPU saturation.
- **Financial Precision Loss**: Storing monetary amounts using IEEE 754 floating-point `Double` instead of high-precision `Decimal128`.
- **Connection Storms & Topology Starvation**: Instantiating a new `MongoClient` per HTTP request or failing to configure connection pool limits.
- **Undocumented & Flaky Migrations**: Treating database migrations as an afterthought, risking concurrency collisions, lack of distributed locks, or running unverified changes without a rollback runbook.

This plugin establishes modern, production-grade engineering standards for MongoDB across four foundational pillars:

1. **Schema Design & Data Modeling (`modern-mongodb-data-modeling`)**: Access-pattern-driven modeling, embedding vs. referencing decision frameworks, advanced schema patterns (Bucket, Subset, Polymorphic, Attribute, Extended Reference, Schema Versioning), declarative collection-level `$jsonSchema` validation, and strict BSON data typing (`Decimal128`, UTC `Date`, standard UUIDs).
2. **Indexing & Query Performance (`modern-mongodb-indexing-and-queries`)**: The golden **ESR Rule** (Equality, Sort, Range), covered queries (`totalDocsExamined: 0`), partial and TTL indexes, wildcard indexing, hidden indexes for safe deprecation, query profiling with `explain("executionStats")`, and aggregation pipeline craftsmanship.
3. **Resilience, Topology & Operations (`modern-mongodb-resilience-and-ops`)**: Process-wide singleton `MongoClient` lifecycle, connection pool bounds, write concerns (`w: "majority"`, `j: true`), read concerns (`majority`), causal consistency client sessions, multi-document ACID transactions with transient error retry loops, and container healthcheck choreography.
4. **Migrations, Schema Evolution & Living Runbooks (`modern-mongodb-migrations-and-lifecycle`)**: Declarative, automated migrations via `migrate-mongo`, zero-secret dynamic configuration, distributed locking (`changelog_lock`), zero-downtime Expand/Contract patterns, memory-safe cursor streaming with batched `bulkWrite`, containerized execution (`Dockerfile.migrate-mongo`), and the **mandatory dedicated `README.md` living runbook mandate**.

---

## What's Included

### 1. Automatic Guardrails (`rules/AGENTS.md`)
Automatically enforced across all projects utilizing MongoDB:
- **Declarative Collection Schema Validation (`$jsonSchema`)**: Mandatory collection-level schema validation with `validationLevel: "strict"` and `validationAction: "error"`.
- **Strict BSON Data Typing Hygiene**: Absolute ban on floating-point `Double` for currency (mandate `Decimal128`), ban on string dates (mandate BSON UTC `Date`), and standardized UUID representation.
- **Anti-Pattern Ban: Unbounded Document Growth**: Prohibiting unbounded arrays in favor of the Bucket Pattern, Subset Pattern, or 1:Many referencing.
- **The Golden ESR Rule (Equality, Sort, Range)**: Mandatory compound index ordering (Equality first, Sort second, Range last), sort direction collinearity (matching index order or inverse to avoid in-memory sorts), and absolute ban on parallel multikey arrays.
- **Elimination of Production `COLLSCAN`**: Mandatory query profiling with `explain("executionStats")` and zero tolerance for unindexed full collection scans on large datasets.
- **Resilient Connection Pooling & Majority Concerns**: Singleton `MongoClient` lifecycle, connection pool bounds (`maxPoolSize`, `maxConnecting`), `w: "majority"`, and `readConcern: "majority"`.
- **Selective Multi-Document Transactions**: Maximizing single-document atomicity and using `withTransaction` retry loops solely for cross-collection business invariants.
- **Automated & Versioned Database Migrations with `migrate-mongo`**: Declarative, sequential, timestamped migration scripts (`up` and `down`) with distributed mutual exclusion locks and absolute ban on `lockTtl: 0` (which disables locking).
- **Zero-Downtime Migration Choreography**: The Expand/Contract pattern, online index creation, and cursor streaming with batched `bulkWrite`.
- **Mandatory Dedicated `README.md` Living Runbook**: Absolute mandate requiring any directory housing migration scripts (e.g. `migrate-mongo/`) to maintain an up-to-date living runbook synchronized in every PR.
- **Zero Hardcoded Secrets & Dynamic Environment Decoupling**: Dynamic environment variable injection without insecure fallback defaults.
- **Containerized Migration Execution & Healthcheck Orchestration**: Hardened migration containers (`Dockerfile.migrate-mongo`) and Compose Spec choreography with `condition: service_healthy` and `condition: service_completed_successfully`.

---

### 2. Specialized Skills (`skills/`)

#### 🧱 `modern-mongodb-data-modeling`
Guides schema design, embedding vs referencing trade-offs, advanced modeling patterns, and BSON typing:
- `references/schema_design_and_patterns.md`: Cardinality matrix (1:1, 1:Few, 1:Many, 1:Squillions), production patterns (Subset, Bucket, Native Time Series Collections, Extended Reference, Attribute, Polymorphic, Schema Versioning), and anti-patterns.
- `references/json_schema_validation_and_types.md`: Server-side `$jsonSchema` validators, BSON type taxonomy (`decimal`, `date`, `binData`), validation levels (`strict`/`error`), and dynamic evolution via `collMod`.

#### ⚡ `modern-mongodb-indexing-and-queries`
Guides compound index architecture, query optimization, explain plan diagnostics, and aggregation pipelines:
- `references/compound_indexing_and_esr_rule.md`: The ESR Rule in depth, sort direction collinearity, parallel multikey array restrictions, avoiding in-memory sort spills, index prefix deduplication, partial indexes, TTL indexes, wildcard indexes, and hidden indexes.
- `references/query_optimization_and_explain_plans.md`: Analyzing `explain("executionStats")`, identifying `COLLSCAN` vs `IXSCAN`, achieving covered queries (`totalDocsExamined: 0`), and database profiling (`system.profile`).
- `references/aggregation_pipeline_craftsmanship.md`: Aggregation stage sequencing, early predicate pushdown, the 100MB stage RAM limit, top-k heapsort coalescence, `$setWindowFields` analytic windows, and index-backed `$lookup` joins.

#### 🛡️ `modern-mongodb-resilience-and-ops`
Guides connection pooling, replica set consistency concerns, transactions, security, and container healthchecks:
- `references/connection_pooling_and_topology.md`: Singleton `MongoClient` pattern, connection pool tuning (`maxPoolSize`, `minPoolSize`, `maxConnecting` connection storm defense), socket and network discovery timeouts, and DNS seedlists (`mongodb+srv`).
- `references/transactions_consistency_and_concerns.md`: Write concern durability (`w: "majority"`, `j: true`), read concern isolation levels, causal consistency client sessions, and multi-document ACID transactions.
- `references/security_and_container_healthchecks.md`: RBAC least privilege, application-specific roles, TLS/SSL encryption, Docker container healthcheck recipes (`mongosh --eval "db.adminCommand('ping')"`), and Compose Spec service orchestration.

#### 🚀 `modern-mongodb-migrations-and-lifecycle`
Guides database evolution, `migrate-mongo` craftsmanship, distributed locking, zero-downtime batching, and living runbooks:
- `examples/sample_migration.js`: Production-grade idempotent migration script blueprint with index checking and memory-safe batched `bulkWrite` backfilling.
- `references/migrate_mongo_architecture_and_scripts.md`: `migrate-mongo` configuration, dynamic zero-secret environment variables, `lockTtl` configuration trap, idempotent `up` and `down` script anatomy, and distributed locking (`changelog_lock`).
- `references/zero_downtime_migration_strategies.md`: The three-phase Expand/Contract pattern, online index builds, and cursor streaming with batched `bulkWrite` avoiding lock contention and OOM.
- `references/migration_living_readme_runbook.md`: The mandatory living runbook standard, required sections, complete production-ready template blueprint, and atomic PR synchronization checklist.
- `references/containerized_migration_orchestration.md`: Hardened `Dockerfile.migrate-mongo`, Compose Spec choreography, Taskfile/Makefile runners with Docker fallback, and CI/CD quality gates.

---

## Directory Layout

```text
modern-mongodb-best-practices/
├── plugin.json
├── README.md
├── rules/
│   └── AGENTS.md
└── skills/
    ├── modern-mongodb-data-modeling/
    │   ├── SKILL.md
    │   └── references/
    │       ├── json_schema_validation_and_types.md
    │       └── schema_design_and_patterns.md
    ├── modern-mongodb-indexing-and-queries/
    │   ├── SKILL.md
    │   └── references/
    │       ├── aggregation_pipeline_craftsmanship.md
    │       ├── compound_indexing_and_esr_rule.md
    │       └── query_optimization_and_explain_plans.md
    ├── modern-mongodb-resilience-and-ops/
    │   ├── SKILL.md
    │   └── references/
    │       ├── connection_pooling_and_topology.md
    │       ├── security_and_container_healthchecks.md
    │       └── transactions_consistency_and_concerns.md
    └── modern-mongodb-migrations-and-lifecycle/
        ├── SKILL.md
        ├── examples/
        │   └── sample_migration.js
        └── references/
            ├── containerized_migration_orchestration.md
            ├── migrate_mongo_architecture_and_scripts.md
            ├── migration_living_readme_runbook.md
            └── zero_downtime_migration_strategies.md
```

---

## License

This project is licensed under the [MIT License](LICENSE) - see the LICENSE file for details.
Copyright (c) 2026 Halcyon Tech.
