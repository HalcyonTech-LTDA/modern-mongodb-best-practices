# The Mandatory Living `README.md` Runbook for Database Migrations

In modern distributed systems, database migrations are among the most sensitive operations in the software lifecycle. A flawed or uncoordinated migration can result in service downtime, silent data corruption, or irreversible data loss.

---

## 1. Why Undocumented Migrations Cause Outages

1. **The "Black-Box" Migration Antipattern**: When a migration directory contains dozens of cryptic timestamped JavaScript files without central documentation, engineers and SREs cannot determine what collections or indexes are affected without reverse-engineering raw database driver calls.
2. **Silent Schema Drift**: Without an authoritative catalog of applied vs. expected schema states, local, staging, and production environments inevitably drift apart.
3. **Emergency Rollback Paralysis**: When a bad migration triggers production latency spikes, engineers cannot safely run `migrate-mongo down` if they do not know what the rollback script mutates or what compensating steps are required.
4. **Onboarding Friction**: New team members are unable to set up their local database environments reliably without clear instructions on running migrations natively or via containerized workflows.

---

## 2. The Invariant Living Documentation Mandate

> ### 🚨 The Non-Negotiable Rule
> Any directory or module housing database migration scripts (such as `migrate-mongo/`, `migrations/`, or `db/migrations/`) **MUST maintain a dedicated, up-to-date `README.md` living runbook** located directly in that directory.
>
> Any pull request or commit that introduces, alters, or removes migration scripts, indexes, configuration, or CLI execution options **MUST synchronize this `README.md` within the exact same atomic commit**.

---

## 3. Mandatory Structure of a Migration `README.md`

A production-grade migration `README.md` consists of seven mandatory sections:

### 1. Overview & Database Architecture
- Specifies the target database engine, version baseline, and purpose of the migration module.
- Clarifies how migrations fit into the broader system architecture (e.g., auto-indexing disabled in application frameworks like Spring Data or Mongoose in favor of deterministic pre-boot migration execution).

### 2. Directory Structure
- An ASCII tree documenting the migration directory layout (`migrations/`, config, Dockerfile, package manifests).

### 3. Active Migrations Catalog Matrix (The Core Catalog)
A comprehensive markdown table cataloging every migration script in the repository:
- **Migration Script**: Exact filename with link to the file.
- **Description**: Clear business summary of the change.
- **Collections Affected**: Specific collection names mutated.
- **Indexes / Schema Changes**: Detailed summary of indexes created/dropped, `$jsonSchema` updates, or data transformations applied.

### 4. How to Run (Multi-Workflow Execution Guide)
Clear, copy-pasteable execution recipes covering:
- **Task Runner (Taskfile / Makefile)**: Recommended automated commands (`task migrate:up`, `task migrate:status`, `task migrate:down`).
- **Docker Compose**: Running migrations in local containerized stacks (`docker compose run --rm migrate-mongo up`).
- **Standalone Immutable Container**: Building and running self-contained Docker images for CI/CD gates.
- **Native Node.js / CLI**: Local execution via `npm run` or `npx migrate-mongo`.

### 5. Environment Variables Contract
A strict table documenting all required configuration keys:
- Variable name (`MIGRATE_MONGO_URI`, `MIGRATE_MONGO_DATABASE`).
- Description of purpose.
- **Security Mandate**: Never include hardcoded production credentials, default secrets, or insecure fallbacks. Point to `.env.example`.

### 6. Verification with `mongosh`
Executable verification commands that engineers or automated pipelines can run directly in MongoDB shell:
- Querying the `changelog` collection to verify applied migration records.
- Running `db.<collection>.getIndexes()` to confirm index creation and names.
- Validating schema validator rules using `db.getCollectionInfos()`.

### 7. Rollback & Disaster Recovery Procedures
Step-by-step runbook for reverting migrations safely using `migrate-mongo down`, troubleshooting failed locks, and restoring from backups.

---

## 4. Production Blueprint Template for Migration `README.md`

The following template serves as the canonical blueprint when authoring or reviewing a migration `README.md`:

```markdown
# Database Migrations - [Service Name]

This directory contains declarative, versioned database migration scripts and Docker infrastructure using [**migrate-mongo**](https://www.npmjs.com/package/migrate-mongo) to manage schema evolution, indexes, and data transformations for MongoDB.

In production and cloud environments, application-level automatic index creation is disabled in favor of deterministic, versioned migration scripts that execute prior to application startup.

---

## 1. Directory Structure

\`\`\`text
migrate-mongo/
├── .dockerignore                 # Excludes node_modules from container build context
├── Dockerfile.migrate-mongo      # Immutable container for CI/CD and deployment
├── README.md                     # This living runbook documentation
├── migrate-mongo-config.js       # Central dynamic configuration (URIs, DB names, locks)
├── migrations/                   # Sequential versioned migration scripts
│   ├── 20261001120000-init_collections.js
│   └── 20261005153000-add_customer_indexes.js
├── package-lock.json             # Pinned npm dependency tree
└── package.json                  # Node.js manifest and migration lifecycle scripts
\`\`\`

---

## 2. Active Migrations Catalog Matrix

| Migration Script | Description | Collections Affected | Indexes / Schema Mutations |
| :--- | :--- | :--- | :--- |
| `20261001120000-init_collections.js` | Initialize collections with strict JSON Schema validators | `customers`, `orders` | • Configures `$jsonSchema` validation with `strict` level |
| `20261005153000-add_customer_indexes.js` | Add unique customer index & order ESR index | `customers`, `orders` | • `customers`: `{ email: 1 }` (unique)<br>• `orders`: `{ tenantId: 1, status: 1, createdAt: -1 }` (ESR) |

---

## 3. How to Run

### Option A: Via Taskfile (Recommended)
\`\`\`bash
# Check status of applied vs pending migrations
task migrate:status

# Execute all pending migrations
task migrate:up

# Rollback the last applied migration
task migrate:down

# Create a new timestamped migration script
task migrate:create -- add_product_indexes
\`\`\`

### Option B: Local Development via Docker Compose
\`\`\`bash
# Check migration status
docker compose run --rm migrate-mongo status

# Apply pending migrations
docker compose run --rm migrate-mongo up

# Rollback last migration
docker compose run --rm migrate-mongo down
\`\`\`

### Option C: Standalone Container (Immutable Image for CI/CD)
\`\`\`bash
# Build the migration image:
docker build -f Dockerfile.migrate-mongo -t my-app-migrator:latest .

# Execute pending migrations:
docker run --rm --network app-network \
  -e MIGRATE_MONGO_URI="mongodb://mongodb:27017/my_app_db" \
  my-app-migrator:latest up
\`\`\`

### Option D: Direct Node.js / npm Execution
\`\`\`bash
# Install dependencies
npm ci

# Run migration operations
npm run migrate:status
npm run migrate:up
npm run migrate:down
npm run migrate:create -- <migration_name>
\`\`\`

---

## 4. Environment Variables Reference

Configuration values are resolved dynamically without hardcoded fallback credentials:

| Variable | Description | Source / Contract |
| :--- | :--- | :--- |
| `MIGRATE_MONGO_URI` | Explicit MongoDB connection URI for migration runner | Required (e.g., `mongodb://user:pass@host:27017/db_name`) |
| `MIGRATE_MONGO_DATABASE` | Target database name override | Optional (extracted automatically from URI if omitted) |
| `MIGRATE_MONGO_LOCK_TTL` | Distributed lock TTL in seconds (e.g., `300`). Ban `0`! | Optional (default: `300`s; protects against concurrent deployments) |

---

## 5. Verification with `mongosh`

Verify applied migrations and indexes directly within the MongoDB database shell:

```bash
# 1. Connect to MongoDB instance
mongosh "mongodb://localhost:27017/my_app_db"

# 2. View applied migration history
db.changelog.find().sort({ appliedAt: -1 }).pretty()

# 3. Confirm created indexes
db.customers.getIndexes()
db.orders.getIndexes()
```

---

## 6. Rollback & Disaster Recovery

To revert the most recently applied migration:
```bash
npm run migrate:down
```

In the event of an orphaned distributed lock during an aborted container deployment:
```javascript
// Run in mongosh to inspect and release lock
// Case 1: migrate-mongo native lock (clears lock document; TTL index auto-expires after lockTtl)
db.changelog_lock.find()
db.changelog_lock.deleteMany({})

// Case 2: Custom atomic runner lock document
db.changelog_lock.updateOne({ _id: "migration_runner_lock" }, { $set: { locked: false } })
```
```
