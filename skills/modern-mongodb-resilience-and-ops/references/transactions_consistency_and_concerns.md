# Write Concerns, Read Concerns & Multi-Document Transactions

In a distributed replica set or sharded cluster, data consistency and durability are configured through **Write Concerns**, **Read Concerns**, and **Read Preferences**.

---

## 1. Write Concerns: Durability Guarantees

Write concerns describe the level of acknowledgment requested from MongoDB for write operations.

### Configuration Options:
- **`w: "majority"`** (**Mandatory for Production State Changes**):
  - Requires acknowledgment that the write has propagated to the majority of voting replica set members.
  - Guarantees durability: even if the primary node crashes or loses power immediately after acknowledgment, the write cannot be rolled back during the subsequent election.
- **`j: true`** (**Journaled**):
  - Guarantees that the majority nodes have committed the write to their on-disk journal file before returning acknowledgment.
- **`wtimeoutMS: 5000`** (**Mandatory with majority**):
  - Prevents write operations from blocking indefinitely if network partitions prevent majority replication.

```javascript
// Example: Durable write operation
await db.collection("orders").insertOne(newOrderDocument, {
  writeConcern: {
    w: "majority",
    j: true,
    wtimeoutMS: 5000
  }
});
```

---

## 2. Read Concerns: Isolation & Freshness

Read concerns control what data is returned by query operations:

| Read Concern | Description | Guarantees |
| :--- | :--- | :--- |
| `local` | Default. Returns data from current node's memory/disk without majority verification. | Fastest, but risks dirty reads if node was partitioned and write was subsequently rolled back. |
| `available` | Similar to `local`, used primarily for lowest latency in sharded clusters. | No majority guarantee. |
| `majority` | **Recommended**. Returns data acknowledged by a majority of replica set members. | Immune to replica rollbacks. Prevents dirty reads. |
| `linearizable` | Confirms read with majority at the exact moment of execution. | Strongest consistency (true real-time linearization), but incurs substantial network consensus latency. |
| `snapshot` | Used inside multi-document transactions. | Provides point-in-time snapshot isolation across collections. |

---

## 3. Causal Consistency in Client Sessions

When read operations are distributed to secondaries (via read preference `secondaryPreferred`), asynchronous replication lag can cause a user to write data and immediately fail to see it on a subsequent read ("read-your-own-writes violation").

### Causal Consistency Solution:
Causal consistency links operations chronologically via logical time tokens:
```javascript
const session = client.startSession({ causalConsistency: true });

try {
  // 1. Write on Primary
  await usersCollection.updateOne({ _id: userId }, { $set: { status: "ACTIVE" } }, { session });
  
  // 2. Read on Secondary - Guaranteed to see the update made in Step 1!
  const user = await usersCollection.findOne(
    { _id: userId },
    { session, readPreference: "secondaryPreferred" }
  );
  console.log("Causally consistent status:", user.status); // Guaranteed "ACTIVE"
} finally {
  await session.endSession();
}
```

---

## 4. Multi-Document ACID Transactions

Multi-document transactions provide full ACID guarantees (Atomicity, Consistency, Isolation, Durability) across multiple collections.

### Core Rules for Production Transactions:
1. **Prefer `session.withTransaction()` Helper**:
   - The driver's `withTransaction` callback automatically handles starting the transaction, executing operations, committing, and handling retry loops for `TransientTransactionError` and `UnknownTransactionCommitResult`.
2. **Keep Transactions Short**:
   - WiredTiger maintains snapshot versions in memory during active transactions. Long-running transactions (> 5 seconds) degrade cache performance and increase write conflict rates.
3. **Always Abort on Unhandled Exceptions**:
   - If an error occurs, ensure the session is properly aborted and closed in a `finally` block.
