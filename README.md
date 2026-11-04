<div align="center">

<a href="https://www.halcyontech.com.br/" target="_blank" rel="noopener noreferrer">
  <img src="assets/halcyon-horizontal-cor.svg" alt="Halcyon Tech" height="60">
</a>

# Modern Mongodb Best Practices Plugin
### High-Performance Schema Design, Indexing Strategy & Production Guardrails

[![Antigravity Plugin](https://img.shields.io/badge/Antigravity-Plugin%20v1.0.0-4F46E5.svg)](https://antigravity.google)
[![License: MIT](https://img.shields.io/badge/License-MIT-10B981.svg)](./LICENSE)
[![Website](https://img.shields.io/badge/Website-halcyontech.com.br-008080.svg)](https://www.halcyontech.com.br/)
[![Organization](https://img.shields.io/badge/Organization-HalcyonTech--LTDA-black.svg)](https://github.com/HalcyonTech-LTDA)

<p align="center">
  <b>Professional modern MongoDB engineering best practices covering schema design & data modeling, compound indexing & query performance (ESR rule, explain plans), high availability & connection pooling, zero-downtime database migrations with migrate-mongo, and mandatory living README.md runbook documentation discipline.</b>
</p>

</div>

---

## Installation & Verification

### Antigravity CLI (`agy`)

Install directly into your Antigravity environment via the CLI:

```bash
agy plugin install https://github.com/HalcyonTech-LTDA/modern-mongodb-best-practices
```

Verify that the plugin is active and adheres to the strict official schema:

```bash
agy plugin list
agy plugin validate --strict ./modern-mongodb-best-practices
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

---

## What's Included (Component Catalog)

### Contextual Rules (`rules/`)
Automatically loaded to govern and protect project contexts:
- **[`modern-mongodb-engineering.md`](rules/modern-mongodb-engineering.md)**: >-

### Procedural Skills (`skills/`)
On-demand actionable workflows and runbooks:
- **[`/modern-mongodb-data-modeling`](skills/modern-mongodb-data-modeling/SKILL.md)**: Use this skill when designing, reviewing, or refactoring MongoDB schemas and document models: embedding vs referencing trade-offs, 16MB document limit boundaries, unbounded array prevention, advanced schema design patterns (Bucket, Subset, Polymorphic, Attribute, Extended Reference, Schema Versioning), declarative JSON Schema validation ($jsonSchema), and strict BSON data typing hygiene (Decimal128, Date, UUID).
- **[`/modern-mongodb-indexing-and-queries`](skills/modern-mongodb-indexing-and-queries/SKILL.md)**: Use this skill when designing indexes or optimizing queries and aggregations in MongoDB: compound indexes and the ESR Rule (Equality, Sort, Range), covered queries, partial & TTL indexes, hidden indexes for safe deprecation, explain("executionStats") diagnostics, COLLSCAN elimination, and aggregation pipeline performance optimization.
- **[`/modern-mongodb-migrations-and-lifecycle`](skills/modern-mongodb-migrations-and-lifecycle/SKILL.md)**: Use this skill when managing database schema evolution, indexes, data transformations, or migrations in MongoDB: migrate-mongo package architecture, dynamic zero-secret configuration, idempotent up/down scripts, distributed mutual exclusion locking, zero-downtime Expand/Contract patterns, batched cursor bulkWrite processing, containerized migration execution, and the mandatory dedicated living README.md runbook documentation discipline.
- **[`/modern-mongodb-resilience-and-ops`](skills/modern-mongodb-resilience-and-ops/SKILL.md)**: Use this skill when configuring connection pooling, high-availability topology, read/write concerns, multi-document ACID transactions, security & RBAC, or Docker container healthchecks in MongoDB: singleton MongoClient, majority concerns, causal consistency, transient error retry loops, mongosh healthcheck choreography, and TLS/SCRAM hardening.

---

## Directory Hierarchy

```text
modern-mongodb-best-practices/
├── plugin.json              # Official Antigravity manifest (schema v1)
├── LICENSE                  # MIT License (Copyright 2026 HalcyonTech LTDA)
├── .gitignore               # System ignores & installed_version.json exclusions
├── .gitattributes           # Deterministic line endings (* text=auto eol=lf)
├── README.md                # Golden Standard documentation & runbook
├── assets/
│   ├── logo.svg             # Antigravity marketplace square icon
│   └── halcyon-horizontal-cor.svg # Official Halcyon Tech brand logo (white background)             # Official Halcyon Tech corporate vector symbol
├── rules/                   # Contextual rules discovered automatically
│   └── modern-mongodb-engineering.md
├── skills/                  # Actionable procedural skills (Progressive Disclosure)
│   └── modern-mongodb-data-modeling/
│       └── SKILL.md
│   └── modern-mongodb-indexing-and-queries/
│       └── SKILL.md
│   └── modern-mongodb-migrations-and-lifecycle/
│       └── SKILL.md
│   └── modern-mongodb-resilience-and-ops/
│       └── SKILL.md
```

---

## 💡 Prompt Recipes & Use Cases

```markdown
- "Optimize MongoDB schema design, indexing strategies, and aggregation pipelines"
- "Audit MongoDB queries for performance and explain plan optimization"
- "Configure production-ready connection pools, retryable writes, and transactions"
```

---

## 📄 License & Corporate Governance

Distributed under the **MIT License**. Copyright (c) 2026 **HalcyonTech LTDA**.  
Engineered with precision and excellence by [Halcyon Tech](https://www.halcyontech.com.br/) &mdash; [GitHub Organization](https://github.com/HalcyonTech-LTDA).
