# Advanced MongoDB Schema Design Patterns & Architecture

Designing scalable document models in MongoDB requires shifting from relational Third Normal Form (3NF) to **query-centric modeling**. In document databases, relationships are governed by the volume of children, data lifecycle, update frequency, and read query cardinality.

---

## 1. Embedding vs. Referencing Decision Framework

| Relationship Cardinality | Recommended Strategy | Rationale & Trade-offs |
| :--- | :--- | :--- |
| **One-to-One (1:1)** | **Embed** (single document) | Eliminates multi-document read overhead. Use subdocuments to namespace attributes (e.g., `user.profile`, `user.preferences`). Exception: If subdocument contains multi-megabyte binary data, use separate collection or object store. |
| **One-to-Few (1:N, N ≤ 100)** | **Embed** (array of subdocuments) | Child entities do not outgrow the parent. Read both parent and children in a single atomic disk fetch (e.g., an order with 1-20 line items, a customer with up to 5 shipping addresses). |
| **One-to-Many (1:N, 100 < N < 10,000)** | **Reference (Parent Reference)** | Store parent ID in child documents: `child.parentId = parent._id`. Prevents the parent document from expanding continuously. Indexes on `parentId` provide millisecond lookups. |
| **One-to-Squillions (1:N, N > 10,000)** | **Reference (Parent Reference) + Bucket Pattern** | Absolute ban on embedding arrays. Store foreign key on child document, and group child events into fixed time-bucket or count-bucket chunks (e.g., IoT telemetry, continuous application audit logs). |
| **Many-to-Many (N:M)** | **Two-Way Referencing or Associative Collection** | For small sets (e.g., users to groups, books to authors), store array of IDs on both sides: `authors: [id1, id2]`. For unbounded or metadata-rich relationships (e.g., student course enrollments with grades and terms), use an associative collection. |

---

## 2. Advanced Production Design Patterns

#### Pattern 1: The Subset Pattern
- **Problem**: A document contains an array of hundreds of reviews or comments, but 99% of user requests only display the 10 most recent reviews on the product page. Loading the entire array incurs massive I/O penalties.
- **Solution**: Split the data. Embed only the top N (e.g., 10) most recent or highest-voted items directly inside the main document. Store the full, unbounded historical array in a dedicated `reviews` collection referenced by `productId`.
- **Implementation**:
```javascript
// Product document (Main collection)
const product = {
  _id: "prod_101",
  title: "Ergonomic Mechanical Keyboard",
  price: NumberDecimal("149.99"),
  ratingAverage: NumberDecimal("4.8"),
  recentReviews: [
    {
      reviewId: "rev_998",
      author: "Alice",
      rating: 5,
      summary: "Outstanding tactile feel",
      createdAt: ISODate("2026-10-01T10:00:00Z")
    }
    // Capped at 10 items
  ],
  totalReviewCount: 1420
};

// Complete reviews stored in 'reviews' collection
const review = {
  _id: "rev_998",
  productId: "prod_101",
  author: "Alice",
  rating: 5,
  body: "Detailed review text...",
  helpfulCount: 42,
  createdAt: ISODate("2026-10-01T10:00:00Z")
};
```

---

### Pattern 2: The Bucket Pattern & Native Time Series Collections
- **Problem**: Writing one document per measurement (e.g., every second from 10,000 IoT devices) generates billions of tiny documents, resulting in massive index overhead and low storage compression. Embedding all measurements into an unbounded array per device breaches the 16MB document limit.
- **Solution**: Group measurements into fixed time or count buckets (e.g., 1 document per device per hour, containing up to 3,600 readings).
- **Implementation (Application-Level Bucket)**:
```javascript
const telemetryBucket = {
  _id: "device_402_20261008_12",
  deviceId: "device_402",
  bucketHour: ISODate("2026-10-08T12:00:00Z"),
  count: 3600,
  summary: {
    minTemp: NumberDecimal("21.2"),
    maxTemp: NumberDecimal("25.8"),
    avgTemp: NumberDecimal("23.4")
  },
  readings: [
    { timestamp: ISODate("2026-10-08T12:00:01Z"), temp: NumberDecimal("21.4"), humidity: 55 },
    { timestamp: ISODate("2026-10-08T12:00:02Z"), temp: NumberDecimal("21.5"), humidity: 55 }
  ]
};
```

- **Modern Alternative (Native Time Series Collections)**:
  In modern MongoDB (6.0+, 7.0+, 8.0+), preferred over manual application bucketing for pure telemetry/metrics:
```javascript
// Native Time Series Collection with automated columnar compression
db.createCollection("weather_metrics", {
  timeseries: {
    timeField: "timestamp",
    metaField: "metadata",
    granularity: "seconds" // 'seconds' | 'minutes' | 'hours'
  },
  expireAfterSeconds: 86400 * 90 // Built-in 90-day automatic retention
});
```

---

### Pattern 3: The Extended Reference Pattern
- **Problem**: When normalizing entities across collections, queries constantly need 2 or 3 core parent attributes (e.g., customer name and email on every invoice view), forcing costly `$lookup` joins on every read.
- **Solution**: Denormalize only the frequently accessed, relatively static fields from the referenced entity into the child document.
- **Implementation**:
```javascript
// Invoice document
const invoice = {
  _id: "inv_7701",
  invoiceDate: ISODate("2026-10-08T14:30:00Z"),
  totalAmount: NumberDecimal("450.00"),
  customer: {
    id: "cust_8820",
    name: "Acme Corporation",
    email: "billing@acme.com"
    // Caches immutable or rarely-changing attributes; 
    // detailed customer address/preferences live in 'customers' collection.
  }
};
```

---

### Pattern 4: The Attribute Pattern
- **Problem**: Documents represent heterogeneous products with unpredictable, sparse attributes (e.g., electronics have `voltage`, `screenSize`, `batteryCapacity`; clothing has `size`, `color`, `material`). Creating individual fields for every possible attribute leads to thousands of sparse fields and explodes index requirements.
- **Solution**: Standardize varying attributes into an array of key-value subdocuments. A single multikey index on `{ "attributes.k": 1, "attributes.v": 1 }` indexes all dynamic attributes efficiently.
- **Implementation**:
```javascript
const product = {
  _id: "prod_laptop_01",
  name: "Developer Ultrabook 16",
  attributes: [
    { k: "ram_gb", v: 64 },
    { k: "storage_tb", v: 2 },
    { k: "cpu", v: "M-Series Pro" },
    { k: "color", v: "Space Gray" }
  ]
};
```

---

### Pattern 5: The Polymorphic Pattern
- **Problem**: Different entities in the same domain share common fields but have distinct subtypes (e.g., payment methods: CreditCard, BankTransfer, Crypto, DigitalWallet).
- **Solution**: Store all subtypes in a single collection, distinguishing them with an explicit `type` or `discriminator` field. Use collection-level `$jsonSchema` conditionals (`if`/`then`) to enforce subtype-specific validation.

---

### Pattern 6: The Schema Versioning Pattern
- **Problem**: Database schemas evolve as application features change. Updating millions of legacy documents in a single blocking migration risks downtime and write lock contention.
- **Solution**: Add a `schemaVersion` integer to every document. The application code supports both current and previous versions (e.g., reading V1 and V2 models). Documents are upgraded lazily on write or via background batched migrations.
- **Implementation**:
```javascript
const customer = {
  _id: "cust_331",
  schemaVersion: 2, // V1 had 'fullName', V2 splits into 'firstName' and 'lastName'
  firstName: "Grace",
  lastName: "Hopper",
  status: "ACTIVE"
};
```

---

## 3. Anti-Patterns to Prohibit

1. **Relational Decomposition (Over-Normalization)**:
   - Creating separate collections for every minor attribute (e.g., `user_addresses`, `user_emails`, `order_status_history`) and querying them via nested `$lookup` pipelines.
   - *Fix*: Leverage document nesting. If data is queried together and updated together, embed it.

2. **Unbounded Growing Arrays**:
   - Pushing log entries, audit events, or chat messages directly into an unbounded array inside a single document.
   - *Fix*: Apply the Bucket Pattern or model children in a dedicated collection with a parent foreign key.

3. **Storing Large Binary BLOBs Directly in Documents**:
   - Storing base64 strings or binary blobs (PDFs, high-res images, video files > 1MB) directly in BSON documents.
   - *Fix*: Store binary assets in S3/GCS object storage and store the metadata URI in MongoDB, or use GridFS for files exceeding 16MB.

4. **Floating-Point IEEE 754 for Currency**:
   - Storing prices, wallet balances, or fee calculations as JavaScript `Number` / BSON `Double`.
   - *Fix*: Always enforce BSON `Decimal128` (`NumberDecimal("99.95")`).
