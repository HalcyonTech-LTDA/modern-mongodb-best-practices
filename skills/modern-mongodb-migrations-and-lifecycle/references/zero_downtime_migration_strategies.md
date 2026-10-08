# Zero-Downtime Migration Strategies & High-Volume Batching

In modern cloud-native architectures, applications must maintain 99.99%+ availability. Database migrations that lock collections or cause memory bloat directly threaten service uptime.

---

## 1. The Expand/Contract (Parallel Run) Pattern

The Expand/Contract pattern decouples schema transformations into non-breaking, incremental phases:

```text
[Phase 1: Expand]           [Phase 2: Migrate]           [Phase 3: Contract]
Application writes to       Migration backfills          Application stops writing
BOTH old & new fields.      historical data in           to old field. Reads only
Reads use new field with    batched chunks.              from new field. Legacy
fallback to old field.                                   field is pruned from DB.
```

### Phase 1: Expand
- Add the new field or structure to database validators without removing old fields.
- Deploy an application update where:
  - New writes write to **both** `v1` and `v2` representations.
  - Reads check `v2`; if missing, fall back to reading `v1`.

### Phase 2: Migrate (Backfill)
- Run a background `migrate-mongo` script to transform all historical documents that only possess the `v1` structure.
- Execute changes in batches to avoid locking the database or saturating WiredTiger cache.

### Phase 3: Contract
- Deploy the application update removing legacy `v1` read/write code.
- Run a cleanup migration script to drop `v1` fields via `$unset` and remove deprecated legacy indexes.

---

## 2. High-Volume Batching with Cursor Streaming & `bulkWrite`

### Anti-Pattern: Memory Exhaustion with `find().toArray()`
// ANTIPATTERN: Will crash Node.js process if collection has 500,000 documents!
async function badMigration(db) {
  const allDocs = await db.collection('orders').find({}).toArray();
  for (const doc of allDocs) {
    await db.collection('orders').updateOne({ _id: doc._id }, { $set: { status: 'PROCESSED' } });
  }
}
```

### Production Pattern: Batched Cursor Streaming with Unordered `bulkWrite`
```javascript
const collection = db.collection('orders');
const BATCH_SIZE = 500;

// Cursor streams documents without loading entire dataset into RAM
const cursor = collection.find({ migratedField: { $exists: false } })
                         .project({ _id: 1, legacyField: 1 })
                         .batchSize(BATCH_SIZE);

const operations = [];
let totalMigrated = 0;

while (await cursor.hasNext()) {
  const doc = await cursor.next();

  operations.push({
    updateOne: {
      filter: { _id: doc._id },
      update: {
        $set: {
          migratedField: transform(doc.legacyField),
          updatedAt: new Date()
        }
      }
    }
  });

  if (operations.length >= BATCH_SIZE) {
    // Unordered bulkWrite allows MongoDB to parallelize writes across shards/nodes
    await collection.bulkWrite(operations, { ordered: false });
    totalMigrated += operations.length;
    operations.length = 0; // Clear memory array
    console.log(`[Batch Progress] Processed ${totalMigrated} documents...`);
  }
}

// Flush remaining operations
if (operations.length > 0) {
  await collection.bulkWrite(operations, { ordered: false });
  totalMigrated += operations.length;
}

console.log(`[Batch Completed] Successfully transformed ${totalMigrated} documents.`);
```

---

## 3. Safe Online Index Creation

In MongoDB 4.2+, index builds are performed simultaneously across secondaries and the primary. While index builds no longer take exclusive collection locks for the entire duration, large builds consume substantial disk I/O and RAM.

### Best Practices:
1. **Always specify explicit index names**:
   Never let MongoDB generate automatic names like `field1_1_field2_-1_field3_1`. Explicit names (e.g., `idx_orders_customer_status`) make indexes identifiable in explain plans, logs, and migrations.
2. **Include `{ background: true }` for backwards compatibility**:
   Ensures safe execution across heterogeneous server environments.
3. **Rolling Index Builds on Large Replica Sets (> 100M documents)**:
   For massive datasets, perform rolling index builds: take secondaries offline one at a time, build the index as a standalone node, rejoin the replica set, step down the primary, and repeat.
