# Browser Session Orchestrator API Examples

## Authentication
The API doesn't require authentication by default, but you can add it via ingress or API gateway.

## Create a Session
```bash
curl -X POST http://localhost:3000/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "timeout": 3600,
    "options": {
      "headless": true,
      "viewport": {"width": 1920, "height": 1080}
    }
  }'
```

Response:
```json
{
  "sessionId": "abc123-def456-ghi789",
  "status": "created",
  "message": "Session created successfully"
}
```

## Check Session Status
```bash
curl http://localhost:3000/sessions/abc123-def456-ghi789/status
```

Response:
```json
{
  "sessionId": "abc123-def456-ghi789",
  "status": "running",
  "podName": "browser-session-abc123-def456-ghi789-xyz",
  "podIP": "10.244.1.15",
  "createdAt": "2025-06-24T10:30:00Z",
  "lastUsed": "2025-06-24T10:32:15Z",
  "health": {
    "healthy": true,
    "status": 200
  }
}
```

## Proxy Browser API Calls
```bash
# Navigate to a page
curl -X POST http://localhost:3000/sessions/abc123-def456-ghi789/proxy/navigate \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Take a screenshot
curl -X GET http://localhost:3000/sessions/abc123-def456-ghi789/proxy/screenshot \
  --output screenshot.png

# Execute JavaScript
curl -X POST http://localhost:3000/sessions/abc123-def456-ghi789/proxy/execute \
  -H "Content-Type: application/json" \
  -d '{"script": "return document.title;"}'
```

## List All Sessions
```bash
curl http://localhost:3000/sessions
```

## Delete a Session
```bash
curl -X DELETE http://localhost:3000/sessions/abc123-def456-ghi789
```

## Health Check
```bash
curl http://localhost:3000/health
```

## Metrics (Prometheus format)
```bash
curl http://localhost:3000/metrics
```

---
# scripts/monitor-deploy.sh
#!/bin/bash

set -e

echo "Deploying monitoring stack..."

# Apply Prometheus configuration
kubectl apply -f monitoring/prometheus.yaml

# Apply Grafana configuration
kubectl apply -f monitoring/grafana.yaml

# Apply alert rules
kubectl apply -f monitoring/alerts.yaml

# Wait for deployments
echo "Waiting for monitoring stack to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/prometheus -n browser-sessions
kubectl wait --for=condition=available --timeout=300s deployment/grafana -n browser-sessions

echo "Monitoring stack deployed!"
echo ""
echo "Access Grafana dashboard:"
echo "kubectl port-forward service/grafana 3000:3000 -n browser-sessions"
echo "Then visit: http://localhost:3000 (admin/admin123)"
echo ""
echo "Access Prometheus:"
echo "kubectl port-forward service/prometheus 9090:9090 -n browser-sessions"
echo "Then visit: http://localhost:9090"
