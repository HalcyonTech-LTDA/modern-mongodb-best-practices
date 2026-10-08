# Connection Pooling & Topology Tuning

Establishing network connections to MongoDB replica sets is an expensive operation involving TCP 3-way handshakes, TLS negotiation, SCRAM-SHA-256 authentication, and Server Discovery and Monitoring (SDAM) handshakes. Proper client lifecycle and pool management is essential to prevent latency spikes and connection storms.

---

## 1. Client Lifecycle Architecture

### The Singleton Imperative
A single `MongoClient` instance must be shared across the entire application lifecycle. 
- **Node.js**: Cache the connected client in a singleton module or dependency injection container.
- **Java**: Inject a single `MongoClient` bean managed by the Spring / CDI application context.
- **Go / Python**: Maintain a global pointer or shared context pool.

```javascript
// db-client.js (Singleton Pattern)
const { MongoClient } = require('mongodb');

let clientInstance = null;

async function getMongoClient() {
  if (!clientInstance) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is required');
    }
    
    clientInstance = new MongoClient(uri, {
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '100', 10),
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '10', 10),
      maxConnecting: parseInt(process.env.MONGODB_MAX_CONNECTING || '2', 10),
      maxIdleTimeMS: 60000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000
    });
    
    await clientInstance.connect();
  }
  return clientInstance;
}

module.exports = { getMongoClient };
```

---

## 2. Recommended Connection Pool Settings

| Parameter | Recommended Baseline | Operational Rationale |
| :--- | :--- | :--- |
| `maxPoolSize` | `50` - `100` (per application instance) | Caps concurrent active sockets per process. Setting this too high (e.g., 1000) causes thread contention and exhausts WiredTiger connection limits across multiple microservice pods. |
| `minPoolSize` | `5` - `10` | Keeps a baseline pool of authenticated warm sockets ready, preventing cold-start latency on sudden traffic bursts. |
| `maxConnecting` | `2` (Default) | Maximum number of concurrent connections the pool may establish simultaneously. Prevents "connection storms" from overwhelming the MongoDB primary during traffic spikes or container restarts. |
| `maxIdleTimeMS` | `60000` (60s) | Closes idle connections exceeding the threshold to reclaim server-side socket resources. |
| `waitQueueTimeoutMS` | `5000` (5s) | Maximum time an incoming request will wait for a pooled connection to become available before failing fast, preventing indefinite thread starvation. |

---

## 3. Network & Discovery Timeouts

| Parameter | Recommended Value | Failure Prevention |
| :--- | :--- | :--- |
| `serverSelectionTimeoutMS` | `5000` (5s) | How long the driver spends discovering an eligible server before failing. Default (30s) is far too long for high-availability microservices. |
| `connectTimeoutMS` | `10000` (10s) | Initial TCP connection establishment timeout. |
| `socketTimeoutMS` | `30000` - `45000` (30-45s) | Inactivity timeout on an open socket. Protects against stalled queries hanging connections indefinitely. |
| `retryWrites` | `true` (Default) | Automatically retries single-document write operations once if a network error occurs. |
| `retryReads` | `true` (Default) | Automatically retries supported read operations once if a network disconnect occurs. |

---

## 4. Modern Connection URI Standards

Modern deployments use the DNS Seedlist format (`mongodb+srv://`) which queries DNS SRV records for dynamic node discovery and TXT records for default connection options:

```bash
# Production DNS Seedlist Connection String:
mongodb+srv://app_user:SECURE_PASSWORD@cluster0.example.mongodb.net/production_db?retryWrites=true&w=majority&appName=OrderService
```
