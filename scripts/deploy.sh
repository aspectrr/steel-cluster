#!/bin/bash

set -e

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
kubectl apply -f kubernetes/orchestrator/
kubectl apply -f kubernetes/monitoring/grafana/
kubectl apply -f kubernetes/monitoring/prometheus/
# Prometheus Service Monitors
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml
kubectl apply -f kubernetes/monitoring.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/cloud/deploy.yaml
kubectl apply -f kubernetes/ingress.yaml
# Wait for deployments to be ready
echo "Waiting for deployments to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/redis -n browser-sessions
kubectl wait --for=condition=available --timeout=300s deployment/browser-orchestrator -n browser-sessions

echo "Deployment complete!"

# Get service URL
echo "Getting service information..."
kubectl get services -n browser-sessions

echo ""
echo "To test the API locally:"
echo "Visit: http://localhost/docs"
echo ""
echo "To test Grafana:"
echo "Then visit: http://localhost/grafana"
echo "username: admin"
echo "password: admin123"
echo ""
echo "To test Prometheus:"
echo "Then visit: http://localhost/prometheus"
echo ""
