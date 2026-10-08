# Declarative JSON Schema Validation & BSON Typing Hygiene

Modern MongoDB provides server-side declarative schema validation via `$jsonSchema` (Draft 4/Draft 7 compatible). While MongoDB is dynamic, production systems require strict validation at the database boundary to prevent data corruption, partial writes, and polyglot driver inconsistencies.

---

## 1. Declarative `$jsonSchema` Architecture

### Configuration Parameters:
- **`validator`**: The `$jsonSchema` document defining fields, types, and constraints.
- **`validationLevel`**:
  - `"strict"` (**Mandatory in production**): Applies validation rules to all inserts and all updates.
  - `"moderate"`: Applies validation to inserts and updates to documents that already fulfill the validation criteria. (Useful only during migration transition phases).
  - `"off"`: Disabled.
- **`validationAction`**:
  - `"error"` (**Mandatory in production**): Rejects any write that violates the schema and throws a validation error.
  - `"warn"`: Allows the write but logs a warning to the MongoDB server diagnostic log.

---

## 2. BSON Types Reference in `$jsonSchema`

When declaring types in `$jsonSchema`, use `bsonType` rather than generic JSON `type` to leverage native MongoDB types:

| BSON Type Name | BSON Code | Use Case & Validation Standard |
| :--- | :--- | :--- |
| `"string"` | 2 | Text fields, enum codes, emails, URLs. |
| `"object"` | 3 | Embedded subdocuments. Always define `additionalProperties: false` on static models. |
| `"array"` | 4 | Lists and embedded collections. Always declare `maxItems` to prevent unbounded array bloat. |
| `"binData"` | 5 | Binary payloads, cryptographic hashes, UUIDs (`uuidRepresentation: 'standard'`). |
| `"objectId"` | 7 | MongoDB native `_id` identifiers. |
| `"bool"` | 8 | Boolean flags (`true` / `false`). |
| `"date"` | 9 | Native UTC timestamps (`ISODate`). Absolute ban on date strings. |
| `"null"` | 10 | Explicit null values. Use union: `bsonType: ["string", "null"]` for nullable fields. |
| `"int"` | 16 | 32-bit signed integers (counts, sequence numbers, quantities). |
| `"long"` | 18 | 64-bit signed integers (high-precision counters, epoch nanoseconds). |
| `"decimal"` | 19 | 128-bit IEEE 754-2008 decimal floating point (`NumberDecimal`). Mandatory for currency! |

---

## 3. Production Collection Schema Blueprint

The following example defines an enterprise `accounts` collection with strict types, financial precision, and regex validation:

```javascript
db.createCollection("accounts", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "accountNumber",
        "ownerId",
        "currency",
        "balance",
        "status",
        "limits",
        "createdAt",
        "updatedAt"
      ],
      properties: {
        _id: {
          bsonType: "objectId"
        },
        accountNumber: {
          bsonType: "string",
          pattern: "^[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}$",
          description: "Must be a valid international IBAN format"
        },
        ownerId: {
          bsonType: "string",
          description: "Canonical owner UUID"
        },
        currency: {
          bsonType: "string",
          enum: ["USD", "EUR", "GBP", "JPY", "BRL"],
          description: "ISO 4217 3-letter currency code"
        },
        balance: {
          bsonType: "decimal",
          description: "Current ledger balance stored as Decimal128"
        },
        status: {
          enum: ["PENDING_VERIFICATION", "ACTIVE", "FROZEN", "CLOSED"],
          description: "Account lifecycle status"
        },
        limits: {
          bsonType: "object",
          required: ["dailyTransferMax", "singleTransactionMax"],
          properties: {
            dailyTransferMax: { bsonType: "decimal" },
            singleTransactionMax: { bsonType: "decimal" }
          },
          additionalProperties: false
        },
        tags: {
          bsonType: "array",
          maxItems: 20, // Prevents array growth anti-pattern
          items: {
            bsonType: "string"
          }
        },
        createdAt: {
          bsonType: "date",
          description: "UTC creation timestamp"
        },
        updatedAt: {
          bsonType: "date",
          description: "UTC last updated timestamp"
        }
      },
      additionalProperties: false // Banning undeclared rogue fields
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
```

---

## 4. Modifying Existing Collection Schemas (`collMod`)

To evolve schemas dynamically in a running system (e.g., inside a versioned migration script), use the `collMod` administrative command:

```javascript
// Adding a new required field 'kycStatus' to existing accounts collection
db.runCommand({
  collMod: "accounts",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "accountNumber",
        "ownerId",
        "currency",
        "balance",
        "status",
        "kycStatus", // New required field
        "createdAt",
        "updatedAt"
      ],
      properties: {
        // ... updated property declarations
        kycStatus: {
          enum: ["NOT_STARTED", "PENDING", "APPROVED", "REJECTED"],
          description: "Customer KYC verification status"
        }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});
```

---

## 5. Investigating Validation Failures

When a write violates schema rules, MongoDB returns a detailed error document. Inspect the `errInfo.details` object to determine the exact violated path:

```json
{
  "failingDocumentId": "ObjectId('670559a413158b456e72b492')",
  "details": {
    "operatorName": "$jsonSchema",
    "schemaRulesNotSatisfied": [
      {
        "operatorName": "properties",
        "propertiesNotSatisfied": [
          {
            "propertyName": "balance",
            "description": "Current ledger balance stored as Decimal128",
            "details": [
              {
                "operatorName": "bsonType",
                "specifiedAs": { "bsonType": "decimal" },
                "reason": "type did not match",
                "consideredValue": 100.50,
                "consideredType": "double"
              }
            ]
          }
        ]
      }
    ]
  }
}
```
*Takeaway*: The write attempted to insert a `double` (100.50) instead of a `NumberDecimal("100.50")`. The database server cleanly intercepted and rejected the corrupted data.
