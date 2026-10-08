---
name: modern-mongodb-migrations-and-lifecycle
description: >-
  Use this skill when managing database schema evolution, indexes, data transformations, or migrations in MongoDB:
  migrate-mongo package architecture, dynamic zero-secret configuration, idempotent up/down scripts,
  distributed mutual exclusion locking, zero-downtime Expand/Contract patterns, batched cursor bulkWrite processing,
  containerized migration execution, and the mandatory dedicated living README.md runbook documentation discipline.
---

# Modern MongoDB Migrations, Evolution & Lifecycle Management

This skill provides comprehensive architectural guidelines, migration scripting patterns, distributed locking mechanisms, zero-downtime evolution strategies, and the **mandatory living `README.md` runbook standard** for database migrations using [**migrate-mongo**](https://www.npmjs.com/package/migrate-mongo) (and compatible tools) in modern MongoDB (6.0+, 7.0+, 8.0+).

---

## Core Principles

1. **Debunking the "Schemaless" Myth**:
   - The idea that "MongoDB is schemaless, so it doesn't need migrations" is a dangerous anti-pattern. While documents within a collection can have flexible fields, production systems evolve:
     - New indexes must be provisioned deterministically before code deployment.
     - Deprecated indexes must be removed to free RAM and avoid write penalties.
     - Collection validators (`$jsonSchema`) must be applied and updated deterministically.
     - Data models undergo structural transformations (renaming fields, converting types, backfilling defaults, splitting or merging entities).
   - In production environments, Spring Data, Mongoose, or Prisma automatic schema/index creation must be disabled (`autoIndex: false` / `auto-index-creation: false`) in favor of versioned, deterministic migration pipelines.

2. **The `migrate-mongo` Migration Lifecycle**:
   - Use the industry-standard npm package [**migrate-mongo**](https://www.npmjs.com/package/migrate-mongo) to track, version, apply, and rollback database changes.
   - Migrations are stored as timestamped files in a dedicated `migrations/` directory (e.g., `YYYYMMDDHHMMSS-migration_name.js`).
   - Each script exports two asynchronous functions:
     - `async up(db, client)`: Applies forward changes (creates indexes, modifies `$jsonSchema`, transforms documents).
     - `async down(db, client)`: Reverts changes cleanly to enable non-destructive rollbacks.
   - Applied migrations are recorded in a dedicated database collection (the `changelog` collection).

3. **Strict Idempotency in Migration Scripts**:
   - Migration scripts MUST be completely **idempotent**: running an already-applied or partially-applied script must not crash, throw duplicate key errors, or corrupt existing data.
   - Always check for index existence before creating (`await collection.indexExists(...)`), verify collection existence before creating, and use `$set` or upsert semantics for data backfills rather than blind inserts.

4. **Distributed Mutual Exclusion Locking & `lockTtl` Discipline**:
   - In containerized, autoscaling, or Kubernetes deployments, multiple application pods or replica containers may spin up simultaneously.
   - If multiple instances execute migrations in parallel, they cause race conditions, duplicate changelog entries, or index build collisions.
   - Mandate distributed locking (via `changelog_lock` collection or atomic test-and-set document) to guarantee that exactly one runner can execute migrations at any given time.
   - **Absolute Ban on `lockTtl: 0`**: In `migrate-mongo-config.js`, setting `lockTtl: 0` disables `migrate-mongo`'s internal locking mechanism completely! Always configure a positive TTL (e.g. `lockTtl: 300` / 5 minutes) so that: (a) migrations are serialized, and (b) stale locks from aborted/crashed containers are automatically evicted by MongoDB's TTL index.

5. **Zero-Downtime Migration Choreography (The Expand/Contract Pattern)**:
   - For high-traffic production databases, schema changes must never require downtime or long-running exclusive locks:
     1. **Phase 1 (Expand)**: Add the new field/structure. Application writes to both old and new representations; reads fall back to old.
     2. **Phase 2 (Migrate)**: Execute migration script to backfill historical documents in batched chunks.
     3. **Phase 3 (Contract)**: Transition application reads and writes exclusively to the new structure; deprecate and remove old fields.

6. **Memory-Safe Batch Processing & Cursor Streaming**:
   - Never load entire collections into memory with `collection.find().toArray()`. Migrations running against collections with millions of documents will trigger Node.js Out-Of-Memory (`JavaScript heap out of memory`) crashes.
   - Use cursor streaming with controlled batch sizes: `collection.find(...).batchSize(500)`.
   - Execute updates using unordered bulk operations: `collection.bulkWrite(operations, { ordered: false })` to achieve maximum write throughput without blocking the event loop.

7. **Zero Secrets & Dynamic Environment Decoupling**:
   - Never hardcode connection strings, database names, or passwords in `migrate-mongo-config.js`.
   - Never supply hardcoded default credentials or production database names as fallback values (e.g. `process.env.DB_URI || 'mongodb://prod:pass@host/prod_db'`).
   - Centralize configuration resolution via environment variables (`MIGRATE_MONGO_URI`, `MONGODB_URI`) and document all required variables in a `.env.example` file.

8. **The Mandatory Living `README.md` Runbook Mandate**:
   - Every directory or project module housing database migration scripts (e.g., `migrate-mongo/`, `migrations/`, `db/migrations/`) **MUST maintain a dedicated, up-to-date `README.md` living runbook** located directly in that directory.
   - Any pull request or commit that introduces, alters, or removes migration scripts, indexes, configuration, or CLI options **MUST synchronize this `README.md` within the exact same atomic commit**.
   - The runbook must document the database architecture, active migrations catalog matrix, local/Docker/CI execution recipes, environment variables, verification commands, and rollback procedures.

---

## Detailed Topic Guides

1. **`migrate-mongo` Architecture & Script Craftsmanship**:
   - Initializing and configuring `migrate-mongo`.
   - Dynamic configuration with zero-secret discipline.
   - Authoring robust, idempotent `up` and `down` migration scripts.
   - Distributed locking mechanisms (`changelog_lock`).
   - [Read Guide](./references/migrate_mongo_architecture_and_scripts.md)

2. **Zero-Downtime Migration Strategies & Batching**:
   - The three-phase Expand/Contract (Parallel Run) migration pattern.
   - Safe online index creation and deprecation.
   - Streaming batched backfills with `cursor.batchSize()` and `bulkWrite()`.
   - [Read Guide](./references/zero_downtime_migration_strategies.md)

3. **Mandatory Living `README.md` Runbook Standard**:
   - Why undocumented migrations cause fatal production outages.
   - Required sections of the living runbook.
   - Complete production-grade template blueprint for a migration `README.md`.
   - Code review checklist and atomic PR synchronization mandate.
   - [Read Guide](./references/migration_living_readme_runbook.md)

4. **Containerized Migration Orchestration & CI/CD**:
   - Standalone migration Dockerfile (`Dockerfile.migrate-mongo`) hardening.
   - Docker Compose service choreography (`condition: service_completed_successfully`).
   - Taskfile / Makefile automation with Docker fallback.
   - CI/CD quality gates in GitHub Actions and GitLab CI.
   - [Read Guide](./references/containerized_migration_orchestration.md)

---

## Blueprint Example: Production `migrate-mongo` Migration Script

```javascript
// migrations/20261008120000-add_customer_email_index_and_tier.js
/**
 * Migration: Add unique index on customers.email and backfill default tier
 */

module.exports = {
  async up(db, client) {
    const customers = db.collection('customers');

    // 1. Idempotent Index Creation
    const indexName = 'idx_customers_email_unique';
    const indexExists = await customers.indexExists(indexName).catch(() => false);
    
    if (!indexExists) {
      await customers.createIndex(
        { email: 1 },
        { unique: true, name: indexName, background: true }
      );
      console.log(`[UP] Created index: ${indexName}`);
    }

    // 2. Memory-Safe Batched Data Backfill
    const cursor = customers.find({ tier: { $exists: false } }).batchSize(500);
    const bulkOps = [];
    let count = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { tier: 'STANDARD', updatedAt: new Date() } }
        }
      });

      if (bulkOps.length >= 500) {
        await customers.bulkWrite(bulkOps, { ordered: false });
        count += bulkOps.length;
        bulkOps.length = 0;
      }
    }

    if (bulkOps.length > 0) {
      await customers.bulkWrite(bulkOps, { ordered: false });
      count += bulkOps.length;
    }

    console.log(`[UP] Backfilled 'tier: STANDARD' for ${count} customer documents.`);
  },

  async down(db, client) {
    const customers = db.collection('customers');

    // 1. Drop index if it exists
    const indexName = 'idx_customers_email_unique';
    const indexExists = await customers.indexExists(indexName).catch(() => false);
    if (indexExists) {
      await customers.dropIndex(indexName);
      console.log(`[DOWN] Dropped index: ${indexName}`);
    }

    // 2. Revert backfilled field
    await customers.updateMany(
      { tier: 'STANDARD' },
      { $unset: { tier: '' } }
    );
    console.log("[DOWN] Reverted 'tier' field for STANDARD customers.");
  }
};
```
