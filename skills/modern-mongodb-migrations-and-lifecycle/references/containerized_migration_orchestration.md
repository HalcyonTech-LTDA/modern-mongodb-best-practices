# Containerized Migration Orchestration & CI/CD Pipelines

To guarantee that migrations run reliably across local development, testing pipelines, and production deployments, `migrate-mongo` should be orchestrated via containerization and task automation.

---

## 1. Production Dockerfile for Migrations (`Dockerfile.migrate-mongo`)

Strictly adhering to Modern Docker Best Practices:
- Syntax directive `# syntax=docker/dockerfile:1`
- Immutable base image pinned to exact patch version (`node:22.12.0-alpine3.20`)
- Multi-stage build decoupling dependency installation from the lean runner
- Non-root user execution (`USER node`)
- Exec form for `ENTRYPOINT` and `CMD`

```dockerfile
# syntax=docker/dockerfile:1
# -------------------------------------------------------------
# Stage 1: Dependency Builder
# -------------------------------------------------------------
FROM node:22.12.0-alpine3.20 AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# -------------------------------------------------------------
# Stage 2: Hardened Migration Runner
# -------------------------------------------------------------
FROM node:22.12.0-alpine3.20 AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy production node_modules from builder
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node migrate-mongo-config.js ./
COPY --chown=node:node migrations/ ./migrations/

# Add local node_modules bin to PATH for direct execution
ENV PATH="/app/node_modules/.bin:$PATH"

# Switch to unprivileged system user
USER node

# Exec form ensures proper signal propagation (no npx network/resolution overhead)
ENTRYPOINT ["migrate-mongo"]
CMD ["up"]
```

---

## 2. Docker Compose Choreography (`compose.yaml`)

Use the versionless Compose Specification and explicit healthcheck conditions to ensure migrations run after MongoDB is healthy and before the application starts:

```yaml
name: enterprise-stack

services:
  mongodb:
    image: mongo:7.0.14
    container_name: mongodb
    environment:
      MONGO_INITDB_DATABASE: app_db
    volumes:
      - mongo_data:/data/db
    networks:
      - internal-net
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand({ ping: 1 }).ok ? 0 : 1"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 10s

  migrate-mongo:
    build:
      context: ./migrate-mongo
      dockerfile: Dockerfile.migrate-mongo
    container_name: migrate-mongo
    environment:
      MIGRATE_MONGO_URI: mongodb://mongodb:27017/app_db
    networks:
      - internal-net
    depends_on:
      mongodb:
        condition: service_healthy
    restart: "no"

  api-service:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: api-service
    ports:
      - "8080:8080"
    environment:
      MONGODB_URI: mongodb://mongodb:27017/app_db
    networks:
      - internal-net
    depends_on:
      mongodb:
        condition: service_healthy
      migrate-mongo:
        condition: service_completed_successfully

volumes:
  mongo_data:

networks:
  internal-net:
```

---

## 3. Automated Task Automation with Docker Fallback (`Taskfile.yaml`)

Provide seamless developer ergonomics that use local Node.js if available, or fall back transparently to Docker Compose:

```yaml
version: '3'

tasks:
  migrate:status:
    desc: Check applied vs pending migration status
    cmds:
      - |
        if command -v node >/dev/null 2>&1 && [ -d "migrate-mongo/node_modules" ]; then
          cd migrate-mongo && npm run migrate:status
        else
          docker compose run --rm migrate-mongo status
        fi

  migrate:up:
    desc: Apply all pending migrations
    cmds:
      - |
        if command -v node >/dev/null 2>&1 && [ -d "migrate-mongo/node_modules" ]; then
          cd migrate-mongo && npm run migrate:up
        else
          docker compose run --rm migrate-mongo up
        fi

  migrate:down:
    desc: Revert the last applied migration
    cmds:
      - |
        if command -v node >/dev/null 2>&1 && [ -d "migrate-mongo/node_modules" ]; then
          cd migrate-mongo && npm run migrate:down
        else
          docker compose run --rm migrate-mongo down
        fi
```

---

## 4. CI/CD Pipeline Quality Gate (GitHub Actions Example)

Run migrations as a discrete pipeline stage before deploying the application container:

```yaml
name: Continuous Deployment

on:
  push:
    branches: [main]

jobs:
  database-migration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Migration Container
        run: |
          docker build -f migrate-mongo/Dockerfile.migrate-mongo \
            -t app-migrator:${{ github.sha }} migrate-mongo

      - name: Execute Migrations
        env:
          MIGRATE_MONGO_URI: ${{ secrets.PROD_MONGODB_URI }}
        run: |
          docker run --rm \
            -e MIGRATE_MONGO_URI="$MIGRATE_MONGO_URI" \
            app-migrator:${{ github.sha }} up

      - name: Verify Migration Status
        env:
          MIGRATE_MONGO_URI: ${{ secrets.PROD_MONGODB_URI }}
        run: |
          docker run --rm \
            -e MIGRATE_MONGO_URI="$MIGRATE_MONGO_URI" \
            app-migrator:${{ github.sha }} status
```
