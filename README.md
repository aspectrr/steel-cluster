# Steel Cluster

Kubernetes-based browser session orchestrator. Creates isolated browser pods per session, routes HTTP and WebSocket (CDP) traffic, and maintains a warm pool for fast session startup.

Built with **Go** (Gin + gorilla/websocket), deployed on Kubernetes with Helm.

## Architecture

```
                    ┌──────────────────────────────┐
                    │      Orchestrator (Go)        │
                    │   Gin HTTP + WS CDP Proxy     │
                    │   Warm Pool Manager           │
                    │   Redis Session Store          │
                    └──────┬───────┬───────┬────────┘
                           │       │       │
              ┌────────────┘       │       └────────────┐
              ▼                    ▼                    ▼
   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
   │  Browser Pod 1  │ │  Browser Pod 2  │ │  Warm Pod (idle)│
   │  (session UUID) │ │  (session UUID) │ │  (pre-warmed)   │
   │  Steel Browser  │ │  Steel Browser  │ │  Steel Browser  │
   └─────────────────┘ └─────────────────┘ └─────────────────┘
```

**How it works:**

1. Client calls `POST /v1/sessions` → orchestrator claims a warm pod (~85ms) or creates a fresh one (~30s)
2. Orchestrator creates a K8s Service pointing to the pod
3. All HTTP requests to `/v1/sessions/{id}/*` are reverse-proxied to the browser pod
4. WebSocket CDP connections (Puppeteer, Playwright) are bidirectionally relayed through the orchestrator
5. Background janitor cleans up orphaned resources; warm pool maintainer keeps pre-warmed pods ready

## Quick Start

### Prerequisites

- Docker Desktop with Kubernetes enabled (or any K8s cluster)
- `kubectl`, `helm`, `go` 1.22+

### 1. Clone & Build

```bash
git clone https://github.com/aspectrr/steel-cluster.git
cd steel-cluster

# Build all images
docker build -t browser-orchestrator:latest ./orchestrator/
docker build -t steel-web:latest ./web/
docker build -t steel-e2e-tests:latest ./tests/
```

### 2. Deploy to Kubernetes

```bash
# Using raw manifests
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/rbac/
kubectl apply -f kubernetes/redis/
kubectl apply -f kubernetes/orchestrator/
kubectl apply -f kubernetes/web/

# Or with Helm
helm install steel-cluster ./helm/steel-cluster/ \
  --namespace browser-sessions \
  --create-namespace \
  --set orchestrator.image.pullPolicy=Never
```

### 3. Verify

```bash
kubectl get pods -n browser-sessions
curl http://localhost:30300/v1/health
```

### 4. Open the Web UI

Navigate to **http://localhost:30301** in your browser.

The Web UI lets you:
- View all active sessions
- Create new browser sessions
- See session details, pod info, and connection URLs
- Delete sessions

API requests from the Web UI are proxied through nginx to the orchestrator at `localhost:30300`.

## API Reference

Interactive docs available at `/documentation` (Scalar UI) when the orchestrator is running.

**Regenerate the OpenAPI spec after code changes:**

```bash
cd orchestrator/
swag init -g main.go -o ./docs --parseDependency --parseInternal
```

### Sessions

| Method   | Path                      | Description                  |
| -------- | ------------------------- | ---------------------------- |
| `POST`   | `/v1/sessions`            | Create a new browser session |
| `GET`    | `/v1/sessions`            | List all sessions            |
| `GET`    | `/v1/sessions/:id`        | Get session details          |
| `GET`    | `/v1/sessions/:id/status` | Get session status           |
| `DELETE` | `/v1/sessions/:id`        | Delete a session             |
| `DELETE` | `/v1/sessions`            | Delete all sessions          |

### Proxy

| Method | Path                     | Description                                |
| ------ | ------------------------ | ------------------------------------------ |
| `*`    | `/v1/sessions/:id/*path` | HTTP reverse proxy to browser pod          |
| `WS`   | `/v1/sessions/:id/cdp/*` | WebSocket CDP proxy (Puppeteer/Playwright) |

### System

| Method | Path                  | Description                        |
| ------ | --------------------- | ---------------------------------- |
| `GET`  | `/v1/health`          | Health check with warm pool status |
| `GET`  | `/documentation`      | Scalar API documentation UI        |
| `GET`  | `/documentation/json` | OpenAPI/Swagger JSON spec          |

### Examples

**Create a session:**

```bash
curl -X POST http://localhost:30300/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"timeout": 600}'
```

Response:

```json
{
  "sessionId": "3959f351-7760-43a9-84e5-6c382e14c173",
  "status": "live",
  "serviceHost": "browser-session-3959f351...browser-sessions.svc.cluster.local",
  "serviceName": "browser-session-3959f351...",
  "podName": "browser-warm-d904eekk"
}
```

**Connect Puppeteer via CDP:**

```typescript
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
  browserWSEndpoint: `ws://localhost:30300/v1/sessions/${sessionId}/cdp/devtools/browser/${browserId}`,
});

const page = await browser.newPage();
await page.goto("https://news.ycombinator.com");
const title = await page.$eval(".titleline > a", (el) => el.textContent);
```

**Health check:**

```bash
curl http://localhost:30300/v1/health
```

Response:

```json
{
  "status": "ok",
  "sessions": 0,
  "warmPoolReady": 2,
  "namespace": "browser-sessions",
  "basePath": "",
  "timestamp": "2026-05-03T00:42:50Z"
}
```

## Warm Browser Pool

The orchestrator maintains a configurable pool of pre-warmed browser pods for near-instant session creation:

- **Default pool size**: 2 pods (configurable via `WARM_POOL_SIZE`)
- **Session creation from warm pool**: ~85ms (vs ~30s cold start)
- **Auto-replenishment**: Background goroutine maintains pool size, creating replacement pods when claimed
- **Stale cleanup**: Prewarm pods running >30 minutes without being claimed are automatically deleted

**How it works:**

1. On startup, the orchestrator seeds the warm pool to target size
2. A background goroutine checks every 10 seconds and creates replacement pods
3. When a session is created, a ready warm pod is claimed, relabeled, and assigned to the session
4. A replacement warm pod is spawned in the background

## Testing Locally

### Web UI (http://localhost:30301)

1. Deploy everything (see Quick Start)
2. Open **http://localhost:30301** in your browser
3. Click "Create Session" — should be near-instant from warm pool
4. See the session appear in the list with its ID, status, and pod name
5. Click a session to see details
6. Click "Delete" to tear down a session and its browser pod

### API with curl (http://localhost:30300)

```bash
# Create a session
SESSION=$(curl -s -X POST http://localhost:30300/v1/sessions | python3 -c "import json,sys; print(json.load(sys.stdin)['sessionId'])")
echo "Session: $SESSION"

# Check health (should show 1 session, 2 warm pods)
curl -s http://localhost:30300/v1/health | python3 -m json.tool

# List sessions
curl -s http://localhost:30300/v1/sessions | python3 -m json.tool

# Delete the session
curl -X DELETE http://localhost:30300/v1/sessions/$SESSION
```

### API Docs (http://localhost:30300/documentation)

Open **http://localhost:30300/documentation** for the interactive Scalar API docs.

### E2E Tests

### Running E2E Tests

Tests run as Kubernetes Jobs inside the cluster (not via port-forward) for reliable WebSocket connectivity:

```bash
# Build the test image
docker build -t steel-e2e-tests:latest ./tests/

# Run the test job
kubectl apply -f tests/job.yaml

# Watch results
kubectl logs -f job/steel-e2e-tests -n browser-sessions

# Clean up
kubectl delete job steel-e2e-tests -n browser-sessions
```

**Tests include:**

- Single session: Creates session, connects Puppeteer via CDP, scrapes top 5 Hacker News stories
- 3 concurrent sessions: Creates 3 sessions in parallel, each scrapes different pages, verifies isolation

## Project Structure

```
steel-cluster/
├── orchestrator/              # Go orchestrator (Gin + gorilla/websocket)
│   ├── main.go                # Routes, handlers, warm pool, WS proxy, janitor
│   ├── k8s.go                 # Kubernetes pod/service CRUD
│   ├── redis.go               # Redis session store
│   ├── helpers.go             # CORS middleware, response helpers
│   ├── Makefile               # Build, deploy, test commands
│   ├── docs/                  # Generated OpenAPI spec (swag)
│   │   ├── swagger.json
│   │   ├── swagger.yaml
│   │   └── docs.go
│   └── Dockerfile
├── tests/                     # E2E tests (Puppeteer)
│   ├── e2e.test.ts            # Main test suite
│   ├── job.yaml               # K8s Job manifest
│   └── Dockerfile
├── web/                       # Web UI (React + Vite + nginx)
│   ├── Dockerfile             # Multi-stage: build + nginx with API proxy
│   └── src/
├── helm/                      # Helm chart
│   └── steel-cluster/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
├── kubernetes/                # Raw K8s manifests
│   ├── namespace.yaml
│   ├── rbac/
│   ├── redis/
│   ├── orchestrator/
│   └── web/
└── scripts/
    ├── deploy.sh
    └── cleanup.sh
```

## Port Reference

| Port  | Service              | URL                              |
| ----- | -------------------- | -------------------------------- |
| 30300 | Orchestrator (NodePort) | http://localhost:30300/v1/health |
| 30301 | Web UI (NodePort)     | http://localhost:30301           |
| 30300 | API Docs              | http://localhost:30300/documentation |

## Configuration

| Env Var           | Default                                      | Description                       |
| ----------------- | -------------------------------------------- | --------------------------------- |
| `PORT`            | `3000`                                       | Orchestrator listen port          |
| `K8S_NAMESPACE`   | `browser-sessions`                           | Kubernetes namespace              |
| `BROWSER_IMAGE`   | `ghcr.io/steel-dev/steel-browser-api:latest` | Browser pod container image       |
| `BROWSER_PORT`    | `3000`                                       | Browser pod HTTP port             |
| `REDIS_HOST`      | `localhost`                                  | Redis host                        |
| `REDIS_PORT`      | `6379`                                       | Redis port                        |
| `WARM_POOL_SIZE`  | `2`                                          | Number of pre-warmed browser pods |
| `MAX_SESSIONS`    | `100`                                        | Maximum concurrent sessions       |
| `SESSION_TIMEOUT` | `1800`                                       | Default session timeout (seconds) |
| `BASE_PATH`       | `""`                                         | API base path prefix              |

## Why Go?

The original orchestrator was written in Fastify/TypeScript. It worked for HTTP proxying but **Fastify's `server.on("upgrade")` silently failed for WebSocket upgrades** — CDP proxy connections never fired. After proving WebSockets work fine in Kubernetes with a minimal test server/client, the issue was 100% a Fastify framework problem.

Go's gorilla/websocket handles upgrades directly in Gin middleware with zero issues. The rewrite also brought:

- Single binary deployment (no node_modules)
- ~50MB Docker image (vs ~300MB Node)
- Goroutine-based concurrency for WS relay and warm pool management
- Clean K8s client-go integration

## License

MIT
