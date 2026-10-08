---
name: modern-mongodb-resilience-and-ops
description: >-
  Use this skill when configuring connection pooling, high-availability topology, read/write concerns,
  multi-document ACID transactions, security & RBAC, or Docker container healthchecks in MongoDB:
  singleton MongoClient, majority concerns, causal consistency, transient error retry loops,
  mongosh healthcheck choreography, and TLS/SCRAM hardening.
---

# Modern MongoDB Resilience, Consistency & Operations

This skill provides comprehensive architectural guidelines, connection pool tuning recipes, consistency concern configurations, transaction patterns, and container orchestration standards for modern MongoDB (6.0+, 7.0+, 8.0+).

---

## Core Principles

1. **Process-Wide Singleton `MongoClient`**:
   - The driver's `MongoClient` encapsulates an internal connection pool, server monitoring background threads (SDAM - Server Discovery and Monitoring), and topology state.
   - **Absolute Rule**: Instantiate `MongoClient` exactly once per application process lifetime. Never create a client instance per HTTP request, database operation, or background worker task. Creating multiple clients exhausts server connection limits and adds massive TCP handshake overhead.

2. **Durable & Consistent Majority Concerns**:
   - **Write Concern (`w: "majority"`, `j: true`)**: Guarantees that writes are acknowledged only after being written to the on-disk journal (`j: true`) of a majority of voting replica set members. This eliminates data loss during primary failover elections.
   - **Read Concern (`majority`)**: Ensures read operations return data committed to a majority of nodes. Prevents dirty reads of transient writes that could be rolled back if an unacknowledged primary steps down.
   - **Causal Consistency (`causalConsistency: true`)**: Enables causally consistent client sessions (`client.startSession({ causalConsistency: true })`), guaranteeing read-your-writes, monotonic reads, and monotonic writes across distributed secondary replicas.

3. **Multi-Document ACID Transactions vs. Single-Document Atomicity**:
   - Prioritize single-document atomicity: MongoDB guarantees full ACID atomicity for all mutations targeting a single document (including subdocuments and arrays) without locking or performance penalties.
   - For multi-document or cross-collection business invariants (e.g., atomic wallet transfers between two balance documents), use driver-managed transactions (`session.withTransaction(...)`).
   - Transactional code MUST handle transient network drops or write conflicts by retrying when receiving `TransientTransactionError` or `UnknownTransactionCommitResult`.

4. **Security, RBAC & Zero Secrets**:
   - Never run MongoDB in production without authentication (`--auth`).
   - Enforce the Principle of Least Privilege: Create application-specific users bound to custom roles with read/write access restricted solely to their required database. Never connect application services using `root`, `clusterAdmin`, or `userAdminAnyDatabase`.
   - Dynamic credentials: All credentials must be injected dynamically via environment variables or secret managers. Banned: Hardcoded credentials or fallback connection strings.
   - Network isolation: Backing MongoDB instances must reside on isolated private subnets or internal Docker bridge networks (`internal: true`), never exposing port 27017 to the public internet.

5. **Container Healthcheck Choreography**:
   - MongoDB container instances MUST declare a lightweight operational healthcheck using `mongosh`:
     `test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand({ ping: 1 }).ok ? 0 : 1"]`
   - Downstream dependent containers (API servers, migration runners) MUST declare `depends_on` with `condition: service_healthy` before initiating connection handshakes.

---

## Detailed Topic Guides

1. **Connection Pooling & Topology Tuning**:
   - Configuring connection pool parameters: `minPoolSize`, `maxPoolSize`, `maxIdleTimeMS`, `waitQueueTimeoutMS`.
   - Timeout configurations: `connectTimeoutMS`, `socketTimeoutMS`, `serverSelectionTimeoutMS`.
   - Modern URI format (`mongodb+srv://`) and replica set discovery.
   - [Read Guide](./references/connection_pooling_and_topology.md)

2. **Read/Write Concerns, Causal Consistency & Transactions**:
   - Durability guarantees: `w: "majority"`, `j: true`, `wtimeoutMS`.
   - Read concerns: `local`, `majority`, `linearizable`.
   - Causal consistency in client sessions.
   - Multi-document transactions using `withTransaction` and transient error retries.
   - [Read Guide](./references/transactions_consistency_and_concerns.md)

3. **Security, RBAC & Container Healthcheck Choreography**:
   - SCRAM-SHA-256 authentication and custom least-privilege roles.
   - TLS/SSL encryption in-transit.
   - Docker Compose service definition with native `mongosh` healthchecks.
   - Choreographing dependent containers (`condition: service_healthy`).
   - [Read Guide](./references/security_and_container_healthchecks.md)

---

## Blueprint Example: Resilient Multi-Document Transaction

```javascript
// Node.js MongoDB Driver Example
const { MongoClient } = require('mongodb');

async function transferFunds(client, sourceAccountId, targetAccountId, amountDecimal) {
  const session = client.startSession();

  try {
    // withTransaction automatically manages transaction start, commit, abort,
    // and retries on TransientTransactionError or UnknownTransactionCommitResult
    await session.withTransaction(async () => {
      const accounts = client.db('banking').collection('accounts');

      // 1. Debit source account
      const debitResult = await accounts.updateOne(
        { _id: sourceAccountId, balance: { $gte: amountDecimal } },
        { $inc: { balance: amountDecimal.negated() } },
        { session }
      );

      if (debitResult.matchedCount === 0) {
        throw new Error('Insufficient funds or source account not found');
      }

      // 2. Credit target account
      const creditResult = await accounts.updateOne(
        { _id: targetAccountId },
        { $inc: { balance: amountDecimal } },
        { session }
      );

      if (creditResult.matchedCount === 0) {
        throw new Error('Target account not found');
      }
    }, {
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority', j: true, wtimeoutMS: 5000 }
    });

    console.log('Transfer committed successfully with majority durability');
  } finally {
    await session.endSession();
  }
}
```
