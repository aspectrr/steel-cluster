#!/bin/bash

echo "Cleaning up Browser Session Orchestrator..."

# Delete all browser session jobs
kubectl delete jobs -l app=headless-browser -n browser-sessions

# Delete the orchestrator deployment
kubectl delete -f kubernetes/orchestrator.yaml
kubectl delete -f kubernetes/redis.yaml
kubectl delete -f kubernetes/rbac.yaml

echo "Cleanup complete!"
