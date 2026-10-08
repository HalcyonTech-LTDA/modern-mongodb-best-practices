---
name: modern-mongodb-data-modeling
description: >-
  Use this skill when designing, reviewing, or refactoring MongoDB schemas and document models:
  embedding vs referencing trade-offs, 16MB document limit boundaries, unbounded array prevention,
  advanced schema design patterns (Bucket, Subset, Polymorphic, Attribute, Extended Reference, Schema Versioning),
  declarative JSON Schema validation ($jsonSchema), and strict BSON data typing hygiene (Decimal128, Date, UUID).
---

# Modern MongoDB Data Modeling & Schema Design

This skill provides comprehensive architectural guidelines, schema patterns, and data typing standards for designing production-grade, scalable, and resilient document models in modern MongoDB (6.0+, 7.0+, 8.0+).

---

## Core Principles

1. **Access Pattern-Driven Modeling**:
   - In MongoDB, **data that is accessed together must be stored together**. Unlike relational database design, which normalizes entities independently of queries, document modeling begins with analyzing application read and write queries, SLAs, and access frequencies.
   - Design schemas to satisfy the most critical 90% of read and write queries with single-document operations, minimizing reliance on `$lookup` multi-collection joins.

2. **Embedding vs. Referencing Decision Matrix**:
   - **Embed (Denormalize)** when:
     - Relationships are 1:1 or 1:Few (e.g., a user profile with up to 5 shipping addresses).
     - Child entities do not have an independent lifecycle outside the parent.
     - Child data is consistently read alongside the parent in the primary UI/API views.
     - The embedded array has a strict, small upper bound (e.g., maximum 50 elements).
   - **Reference (Normalize)** when:
     - Relationships are 1:Many (unbounded) or 1:Squillions (e.g., sensors to measurements, users to log events, products to millions of reviews).
     - Child entities are frequently queried, updated, or manipulated independently of the parent.
     - Embedding would cause documents to exceed the 16MB BSON size limit or cause unbounded disk re-allocations.
     - Entities represent large shared datasets (e.g., global tax rate tables, multi-tenant catalogs).

3. **Absolute Ban on the Unbounded Array Anti-Pattern**:
   - Never use unbounded arrays where items are continuously added via `$push` without a capping mechanism.
   - Continuously growing arrays lead to document expansion on disk (triggering page splits, cache churn, and write latency spikes) and will eventually breach the hard 16MB BSON limit.
   - For high-volume 1:Many relationships, apply the **Bucket Pattern** (grouping metrics or events into fixed-size document buckets) or the **Subset Pattern** (keeping only the top/recent N items in the parent and referencing the rest).

4. **Declarative Server-Side Schema Validation (`$jsonSchema`)**:
   - Never rely exclusively on application-level ORM/ODM validations (such as Mongoose schemas, Spring Data `@Document`, or Pydantic models). Application layers can be bypassed by migrations, direct scripts, or divergent microservices.
   - Define declarative `$jsonSchema` validation at the collection level with `validationLevel: "strict"` and `validationAction: "error"`.
   - Validate field presence, BSON types (`bsonType`), regex patterns, array sizes, and allowed enum values directly in the database engine.

5. **Strict BSON Data Typing & Financial Integrity**:
   - **Monetary / Currency Values**: MUST be stored as `Decimal128` (BSON type `decimal` / 19) or integer minor units (e.g., cents as 64-bit integer `Long`). Never use IEEE 754 floating-point numbers (`Double`), which suffer from rounding errors in financial transactions.
   - **Dates and Timestamps**: MUST be stored as native BSON `Date` objects in UTC. Never store timestamps as formatted strings (e.g., `"2026-10-08T12:00:00Z"`). String dates break native date operators, index range comparisons, and aggregation date math.
   - **UUIDs**: Must use standard BSON binary subtype 4 (`uuidRepresentation: 'standard'`) across all language drivers to prevent byte-ordering endianness corruption across microservice boundaries.

6. **The Schema Versioning Pattern**:
   - Every production document should include a `schemaVersion` integer field (e.g., `schemaVersion: 1`).
   - When introducing structural schema changes, the application can handle polyglot schemas seamlessly during rolling zero-downtime deployments without requiring all historic documents to be rewritten instantly.

---

## Detailed Topic Guides

1. **Schema Design Patterns & Structural Architecture**:
   - In-depth exploration of Embedding vs Referencing.
   - Architectural patterns: Subset, Bucket, Extended Reference, Polymorphic, Attribute, Outlier, Computed, and Schema Versioning.
   - Anti-patterns to detect and eliminate.
   - [Read Guide](./references/schema_design_and_patterns.md)

2. **Declarative JSON Schema Validation & BSON Types**:
   - Crafting collection-level `$jsonSchema` validators.
   - Enforcing types: `Decimal128`, UTC `Date`, `UUID`, arrays, and nested objects.
   - Configuring `validationLevel` and `validationAction`.
   - Applying and evolving schema validation rules via `collMod`.
   - [Read Guide](./references/json_schema_validation_and_types.md)

---

## Blueprint Example: Production Document Modeling with JSON Schema

### Order Document Schema with Embedded Line Items & JSON Schema Validator

```javascript
// Migration or Collection Initialization Script
db.createCollection("orders", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["orderId", "customer", "items", "pricing", "status", "schemaVersion", "createdAt", "updatedAt"],
      properties: {
        orderId: {
          bsonType: "string",
          description: "Canonical business UUID for the order"
        },
        schemaVersion: {
          bsonType: "int",
          minimum: 1,
          description: "Tracks schema evolution version"
        },
        status: {
          enum: ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"],
          description: "Current order lifecycle status"
        },
        customer: {
          bsonType: "object",
          required: ["id", "email", "name"],
          properties: {
            id: { bsonType: "string" },
            email: { bsonType: "string", pattern: "^.+@.+$" },
            name: { bsonType: "string" }
          },
          additionalProperties: false
        },
        items: {
          bsonType: "array",
          minItems: 1,
          maxItems: 100, // Capped: Prevents unbounded array bloat
          items: {
            bsonType: "object",
            required: ["sku", "productName", "unitPrice", "quantity", "lineTotal"],
            properties: {
              sku: { bsonType: "string" },
              productName: { bsonType: "string" },
              unitPrice: { bsonType: "decimal" }, // Decimal128: Financial precision
              quantity: { bsonType: "int", minimum: 1 },
              lineTotal: { bsonType: "decimal" }
            },
            additionalProperties: false
          }
        },
        pricing: {
          bsonType: "object",
          required: ["subtotal", "taxTotal", "shippingCost", "grandTotal", "currency"],
          properties: {
            subtotal: { bsonType: "decimal" },
            taxTotal: { bsonType: "decimal" },
            shippingCost: { bsonType: "decimal" },
            grandTotal: { bsonType: "decimal" },
            currency: { bsonType: "string", pattern: "^[A-Z]{3}$" }
          },
          additionalProperties: false
        },
        createdAt: { bsonType: "date" }, // Native BSON Date in UTC
        updatedAt: { bsonType: "date" }
      },
      additionalProperties: false
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
```
