#!/bin/bash

set -euo pipefail

echo "Deploying Browser Session Orchestrator with Helm..."

# Build local orchestrator image (Docker Desktop makes it available to the cluster)
echo "Building Docker image..."
docker build -t browser-orchestrator:latest ./orchestrator/

# Install/upgrade NGINX Ingress controller
echo "Installing/Upgrading Ingress-NGINX controller..."
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx >/dev/null 2>&1 || true
helm repo update >/dev/null
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

echo "Waiting for Ingress-NGINX controller to be ready..."
kubectl -n ingress-nginx wait --for=condition=available --timeout=300s deployment/ingress-nginx-controller

# Install/upgrade the steel-cluster Helm chart
echo "Installing/Upgrading steel-cluster chart..."
helm upgrade --install steel-cluster ./helm/steel-cluster \
  --namespace browser-sessions --create-namespace \
  --set orchestrator.image.repository=browser-orchestrator \
  --set orchestrator.image.tag=latest \
  --set orchestrator.image.pullPolicy=IfNotPresent \
  --set monitoring.serviceMonitor.enabled=false

# Wait for core components to be ready
echo "Waiting for Redis to be ready..."
kubectl -n browser-sessions wait --for=condition=available --timeout=300s deployment/redis || true

echo "Waiting for Prometheus to be ready..."
kubectl -n browser-sessions wait --for=condition=available --timeout=300s deployment/prometheus || true

echo "Waiting for Grafana to be ready..."
kubectl -n browser-sessions wait --for=condition=available --timeout=300s deployment/grafana || true

echo "Waiting for Browser Orchestrator to be ready..."
kubectl -n browser-sessions wait --for=condition=available --timeout=300s deployment/browser-orchestrator

echo "Deployment complete!"

# Show service and ingress info
echo "Getting service and ingress information..."
kubectl get services -n browser-sessions
kubectl get ingress -n browser-sessions || true

echo ""
echo "Endpoints:"
echo "- Orchestrator: http://localhost/health"
echo "- Grafana:      http://localhost/grafana  (username: admin, password from values)"
echo "- Prometheus:   http://localhost/prometheus"
echo ""
