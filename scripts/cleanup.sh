#!/bin/bash

echo "Cleaning up Browser Session Orchestrator..."

# Delete all browser session jobs
kubectl delete jobs -l app=headless-browser -n browser-sessions

# Delete the orchestrator deployment
kubectl delete -f kubernetes/orchestrator/
kubectl delete -f kubernetes/redis/
kubectl delete -f kubernetes/rbac/
kubectl delete -f kubernetes/monitoring/grafana/
kubectl delete -f kubernetes/monitoring/prometheus/
kubectl delete -f kubernetes/ingress.yaml
kubectl delete -f kubernetes/monitoring.yaml
kubectl delete -f kubernetes/namespace.yaml
kubectl delete jobs --all --all-namespaces

echo "Cleanup complete!"
