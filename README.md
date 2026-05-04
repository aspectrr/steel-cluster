# Steel Cluster

A Kubernetes-based browser session orchestrator. Creates isolated browser pods per session, routes HTTP and WebSocket (CDP) traffic, and maintains a warm pool for fast session startup (~85ms).

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

---

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Kubernetes enabled (or any K8s cluster)
- [`kubectl`](https://kubernetes.io/docs/tasks/tools/) and [`helm`](https://helm.sh/docs/intro/install/)

#### Enable Kubernetes in Docker Desktop

1. Open Docker Desktop → **Settings** → **Kubernetes**
2. Check **Enable Kubernetes**
3. Click **Apply & Restart**
4. Wait for the green indicator in the bottom-left corner
5. Verify: `kubectl get nodes` should show a `Ready` node

### Install (one command)

```bash
helm install steel-cluster oci://ghcr.io/aspectrr/charts/steel-cluster \
  --namespace browser-sessions \
  --create-namespace
```

That's it. This pulls pre-built images from GitHub Container Registry and deploys everything — orchestrator, web UI, Redis, monitoring — into your cluster.

### Verify

```bash
kubectl get pods -n browser-sessions
curl http://localhost:3000/v1/health
```

### Open the Web UI

Navigate to **http://localhost:5173** in your browser.

From the Web UI you can:

- View all active sessions
- Create new browser sessions (near-instant from warm pool)
- See session details, pod info, and connection URLs
- Delete sessions

### Uninstall

```bash
helm uninstall steel-cluster -n browser-sessions
kubectl delete namespace browser-sessions
```

---

## Deploying from Source

If you want to build images locally (for development or contributions):

```bash
git clone https://github.com/aspectrr/steel-cluster.git
cd steel-cluster

# Build images
docker build -t ghcr.io/aspectrr/steel-orchestrator:latest ./orchestrator/
docker build -t ghcr.io/aspectrr/steel-web:latest ./web/

# Deploy with Helm (use IfNotPresent to prefer your local build)
helm upgrade --install steel-cluster ./helm/steel-cluster \
  --namespace browser-sessions \
  --create-namespace \
  --set orchestrator.image.pullPolicy=IfNotPresent \
  --set web.image.pullPolicy=IfNotPresent
```

Or use the deploy script (builds images + installs ingress + deploys chart):

```bash
./scripts/deploy.sh
```

---

## API Reference

Interactive docs available at **http://localhost:3000/documentation** (Scalar UI) when the orchestrator is running.

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
curl -X POST http://localhost:3000/v1/sessions \
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
  browserWSEndpoint: `ws://localhost:3000/v1/sessions/${sessionId}/cdp/devtools/browser/${browserId}`,
});

const page = await browser.newPage();
await page.goto("https://news.ycombinator.com");
const title = await page.$eval(".titleline > a", (el) => el.textContent);
```

**Health check:**

```bash
curl http://localhost:3000/v1/health
```

---

## Warm Browser Pool

The orchestrator maintains a configurable pool of pre-warmed browser pods for near-instant session creation:

- **Default pool size**: 2 pods (configurable via `WARM_POOL_SIZE`)
- **Session creation from warm pool**: ~85ms (vs ~30s cold start)
- **Auto-replenishment**: Background goroutine maintains pool size, creating replacement pods when claimed
- **Stale cleanup**: Prewarm pods running >30 minutes without being claimed are automatically deleted

---

## Testing

### API with curl

```bash
# Create a session
SESSION=$(curl -s -X POST http://localhost:3000/v1/sessions | python3 -c "import json,sys; print(json.load(sys.stdin)['sessionId'])")
echo "Session: $SESSION"

# Check health (should show 1 session, 2 warm pods)
curl -s http://localhost:3000/v1/health | python3 -m json.tool

# List sessions
curl -s http://localhost:3000/v1/sessions | python3 -m json.tool

# Delete the session
curl -X DELETE http://localhost:3000/v1/sessions/$SESSION
```

### E2E Tests

Tests run as Kubernetes Jobs inside the cluster for reliable WebSocket connectivity:

```bash
# Build and run
docker build -t steel-e2e-tests:latest ./tests/
kubectl apply -f tests/job.yaml
kubectl logs -f job/steel-e2e-tests -n browser-sessions

# Clean up
kubectl delete job steel-e2e-tests -n browser-sessions
```

**Tests include:**

- Single session: Creates session, connects Puppeteer via CDP, scrapes top 5 Hacker News stories
- 3 concurrent sessions: Creates 3 sessions in parallel, each scrapes different pages, verifies isolation

---

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
│   └── Dockerfile
├── web/                       # Web UI (React + Vite + nginx)
│   └── Dockerfile             # Multi-stage: build + nginx with API proxy
├── tests/                     # E2E tests (Puppeteer)
│   ├── e2e.test.ts
│   ├── job.yaml
│   └── Dockerfile
├── helm/steel-cluster/        # Helm chart
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
├── kubernetes/                # Raw K8s manifests
└── scripts/
    ├── deploy.sh
    └── cleanup.sh
```

## Port Reference

| Port | Service      | URL                                 |
| ---- | ------------ | ----------------------------------- |
| 3000 | Orchestrator | http://localhost:3000/v1/health     |
| 3000 | API Docs     | http://localhost:3000/documentation |
| 5173 | Web UI       | http://localhost:5173               |

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
