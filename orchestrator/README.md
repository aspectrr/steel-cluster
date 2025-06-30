# Browser Session Orchestrator

A TypeScript-based Kubernetes orchestrator for managing headless browser sessions at scale.

## Overview

This service manages browser sessions running in Kubernetes pods, providing a REST API for creating,
managing, and proxying requests to browser instances. Each session runs in its own isolated
Kubernetes Job with both browser API and UI components.

## Features

- **Session Management**: Create, monitor, and cleanup browser sessions
- **Kubernetes Integration**: Automatic pod lifecycle management
- **Redis Storage**: Session state persistence and caching
- **Health Monitoring**: Built-in health checks and metrics
- **Request Proxying**: Transparent request forwarding to browser instances
- **Auto Cleanup**: Automatic cleanup of inactive sessions
- **Swagger Documentation**: Auto-generated API documentation

## Prerequisites

- Node.js 18+
- TypeScript 5.3+
- Redis server
- Kubernetes cluster access
- Docker (for containerized deployment)

## Development Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=3000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Kubernetes Configuration
K8S_NAMESPACE=default
BROWSER_API_IMAGE=steel-dev/steel-browser-api:latest
BROWSER_UI_IMAGE=steel-dev/steel-browser-ui:latest
BROWSER_API_PORT=3000
BROWSER_UI_PORT=5173
JOB_TTL_SECONDS=3600

# Resource Limits
POD_MEMORY_REQUEST=512Mi
POD_CPU_REQUEST=200m
POD_MEMORY_LIMIT=2Gi
POD_CPU_LIMIT=1000m

# Session Configuration
SESSION_TIMEOUT=1800
MAX_SESSIONS=100
```

### 3. Development Commands

```bash
# Type checking
npm run type-check

# Build TypeScript
npm run build

# Development with hot reload
npm run dev

# Production start
npm start

# Clean build artifacts
npm run clean
```

## API Endpoints

### Session Management

- `POST /sessions` - Create a new browser session
- `GET /sessions/:sessionId/status` - Get session status and health
- `DELETE /sessions/:sessionId` - Delete a session
- `GET /sessions` - List all active sessions

### Proxying

- `ALL /sessions/:sessionId/proxy/*` - Proxy requests to browser instance

### Monitoring

- `GET /health` - Application health check
- `GET /metrics` - Prometheus metrics
- `GET /docs` - Swagger API documentation

## Docker Deployment

### Build Image

```bash
docker build -t browser-session-orchestrator .
```

### Run Container

```bash
docker run -p 3000:3000 \
  -e REDIS_HOST=your-redis-host \
  -e K8S_NAMESPACE=your-namespace \
  browser-session-orchestrator
```

## Kubernetes Deployment

The orchestrator requires the following Kubernetes permissions:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: browser-orchestrator
rules:
  - apiGroups: ["batch"]
    resources: ["jobs"]
    verbs: ["create", "delete", "get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
```

## Configuration

### Session Options

When creating a session, you can pass additional options:

```json
{
  "timeout": 3600,
  "options": {
    "customOption": "value"
  }
}
```

### Resource Management

The orchestrator automatically:

- Limits concurrent sessions based on `MAX_SESSIONS`
- Cleans up inactive sessions after timeout
- Manages Kubernetes Job TTL for automatic cleanup
- Monitors pod health and updates session status

## Monitoring & Observability

### Health Checks

- Application health: `GET /health`
- Session health: Individual session health checks
- Redis connectivity monitoring

### Metrics

Prometheus-compatible metrics available at `/metrics`:

- `browser_sessions_total` - Total number of sessions
- `browser_sessions_running` - Currently running sessions
- `browser_sessions_pending` - Sessions starting up
- `browser_sessions_failed` - Failed sessions

### Logging

Structured logging with:

- Session lifecycle events
- Error tracking
- Performance metrics
- Kubernetes API interactions

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │───▶│  Orchestrator   │───▶│   Kubernetes    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │     Redis       │    │  Browser Pods   │
                       │   (Sessions)    │    │  (API + UI)     │
                       └─────────────────┘    └─────────────────┘
```

## Error Handling

The orchestrator handles various error scenarios:

- **Pod Startup Failures**: Automatic cleanup and error reporting
- **Redis Connection Issues**: Graceful degradation and reconnection
- **Kubernetes API Errors**: Retry logic and error logging
- **Session Timeouts**: Automatic cleanup of stale sessions

## Security Considerations

- Run as non-root user in containers
- Implement proper RBAC for Kubernetes access
- Secure Redis connections with authentication
- Rate limiting for session creation
- Resource limits to prevent resource exhaustion

## Troubleshooting

### Common Issues

1. **Sessions not starting**: Check Kubernetes permissions and image availability
2. **Redis connection errors**: Verify Redis configuration and network connectivity
3. **Pod resource limits**: Adjust memory/CPU limits based on workload
4. **Session cleanup issues**: Check TTL settings and cleanup intervals

### Debug Mode

Enable verbose logging by setting the log level:

```bash
export LOG_LEVEL=debug
npm start
```

## Contributing

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Ensure type safety with strict TypeScript settings

## License

MIT License - see LICENSE file for details
