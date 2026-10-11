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
