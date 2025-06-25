#!/bin/bash

set -e

echo "Deploying Browser Session Orchestrator..."

# Build and push Docker image
echo "Building Docker image..."
docker build -t your-registry/browser-orchestrator:latest .
docker push your-registry/browser-orchestrator:latest

# Apply Kubernetes configurations
echo "Applying Kubernetes configurations..."
kubectl apply -f kubernetes/namespace.yaml
kubectl apply -f kubernetes/rbac.yaml
kubectl apply -f kubernetes/redis.yaml
kubectl apply -f kubernetes/orchestrator.yaml

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
echo "kubectl port-forward service/browser-orchestrator 3000:80 -n browser-sessions"
echo "Then visit: http://localhost:3000/docs"
