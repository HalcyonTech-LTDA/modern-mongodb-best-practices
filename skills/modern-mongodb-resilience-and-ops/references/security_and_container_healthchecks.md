# Security, RBAC & Container Healthcheck Choreography

Securing MongoDB deployments requires defense-in-depth: strict role-based access control (RBAC), network isolation, and resilient container healthcheck choreography.

---

## 1. Role-Based Access Control (RBAC) & Principle of Least Privilege

Never allow application workloads to connect using administrative roles (`root`, `clusterAdmin`, `userAdminAnyDatabase`, or `dbOwner`).

### Provisioning an Application-Specific Least-Privilege User:

```javascript
// Connect as administrative DBA in mongosh / Node.js
const adminDb = db.getSiblingDB("admin");

// Create application-specific user with readWrite access limited exclusively to 'ecommerce_db'
adminDb.createUser({
  user: "app_order_service",
  pwd: passwordPrompt(), // Secure password injection
  roles: [
    { role: "readWrite", db: "ecommerce_db" }
  ]
});
```

For migration runners (e.g., `migrate-mongo`), grant index and schema modification capabilities:
```javascript
// Create migration role with ability to run createIndex, dropIndex, collMod
db.createRole({
  role: "migrationRunnerRole",
  privileges: [
    {
      resource: { db: "ecommerce_db", collection: "" },
      actions: ["find", "insert", "update", "remove", "createIndex", "dropIndex", "createCollection", "dropCollection"]
    }
  ],
  roles: []
});

db.createUser({
  user: "app_migrator",
  pwd: passwordPrompt(),
  roles: [{ role: "migrationRunnerRole", db: "ecommerce_db" }]
});
```

---

## 2. Container Healthcheck Choreography in Compose Spec

In local development and CI/CD pipelines, dependent services often crash with connection refusal errors because the MongoDB daemon has not finished initializing its WiredTiger engine or opening its TCP port.

### The Correct Healthcheck Implementation:
Use `mongosh` to execute a native `ping` administrative command:

```yaml
# compose.yaml (Versionless Compose Spec)
name: ecommerce-infrastructure

services:
  mongodb:
    image: mongo:7.0.14
    container_name: mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: dba_admin
      MONGO_INITDB_ROOT_PASSWORD_FILE: /run/secrets/mongo_root_pass
      MONGO_INITDB_DATABASE: ecommerce_db
    secrets:
      - mongo_root_pass
    volumes:
      - mongodb_data:/data/db
    networks:
      - internal-backend
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand({ ping: 1 }).ok ? 0 : 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    restart: unless-stopped

  migrate-mongo:
    image: ecommerce-migrator:1.0.0
    depends_on:
      mongodb:
        condition: service_healthy
    networks:
      - internal-backend

  order-api:
    image: ecommerce-api:1.0.0
    depends_on:
      mongodb:
        condition: service_healthy
      migrate-mongo:
        condition: service_completed_successfully
    ports:
      - "8080:8080"
    networks:
      - internal-backend

volumes:
  mongodb_data:

networks:
  internal-backend:
    internal: false # Internal bridge network

secrets:
  mongo_root_pass:
    environment: MONGO_ROOT_PASSWORD
```

---

## 3. Network Isolation & Port Security

- **Production Ban on Host Ports**: In production container environments, backing MongoDB instances must NEVER publish `ports: ["27017:27017"]` to the host network interface. Use private container networks.
- **TLS in Transit**: Mandate TLS (`tls=true&tlsCAFile=/path/to/ca.pem`) for all network traffic between microservices and MongoDB clusters.
