#!/bin/bash

set -euo pipefail

echo "Deploying Browser Session Orchestrator..."

# Build and push Docker image
echo "Building Docker image..."
docker build -t browser-orchestrator:latest ./orchestrator/
# docker push ghcr.io/browser-orchestrator:latest

# Apply Kubernetes configurations
echo "Applying Kubernetes configurations..."
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/rbac/
kubectl apply -f kubernetes/redis/

echo "Waiting for Redis deployment to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/redis -n browser-sessions

echo "Waiting for Redis endpoints to be ready..."
RETRY=0
until kubectl get endpoints redis -n browser-sessions -o jsonpath='{.subsets[*].addresses[*].ip}' | grep -qE '([0-9]{1,3}\.){3}[0-9]{1,3}' || [ $RETRY -ge 120 ]; do
  RETRY=$((RETRY+1))
  sleep 1
done

echo "Applying Ingress-NGINX controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/cloud/deploy.yaml
echo "Waiting for Ingress-NGINX controller to be ready..."
kubectl -n ingress-nginx wait --for=condition=available --timeout=300s deployment/ingress-nginx-controller

echo "Applying Browser Orchestrator..."
kubectl apply -f kubernetes/orchestrator/
echo "Setting BASE_PATH for Orchestrator..."
kubectl -n browser-sessions set env deployment/browser-orchestrator BASE_PATH=/orchestrator --overwrite

echo "Applying monitoring stack..."
kubectl apply -f kubernetes/monitoring/grafana/
kubectl apply -f kubernetes/monitoring/prometheus/
# Prometheus Service Monitors
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml
kubectl apply -f kubernetes/monitoring.yaml

echo "Waiting for Browser Orchestrator to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/browser-orchestrator -n browser-sessions

echo "Applying cluster Ingress..."
kubectl apply -f kubernetes/ingress.yaml

echo "Deployment complete!"

# Get service URL
echo "Getting service information..."
kubectl get services -n browser-sessions

echo ""
echo "To test the API locally:"
echo "Visit: http://localhost/orchestrator/health"
echo ""
echo "To test Grafana:"
echo "Then visit: http://localhost/grafana"
echo "username: admin"
echo "password: admin123"
echo ""
echo "To test Prometheus:"
echo "Then visit: http://localhost/prometheus"
echo ""
