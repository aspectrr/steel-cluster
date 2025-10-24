#!/bin/bash

echo "Cleaning up Browser Session Orchestrator..."

# Delete session Services/Pods (active + prewarm) if namespace exists
if kubectl get namespace browser-sessions >/dev/null 2>&1; then
  echo "Deleting session Services and Pods in 'browser-sessions'..."
  # Delete per-session Services (role=active)
  kubectl delete service -l app=browser-session,role=active -n browser-sessions --ignore-not-found
  # Delete per-session Pods (role=active)
  kubectl delete pod -l app=browser-session,role=active -n browser-sessions --ignore-not-found
  # Delete prewarm Pods
  kubectl delete pod -l app=browser-session,role=prewarm -n browser-sessions --ignore-not-found
else
  echo "Namespace 'browser-sessions' does not exist; skipping label-based deletes."
fi

# Delete the orchestrator deployment
kubectl delete -f kubernetes/orchestrator/
kubectl delete -f kubernetes/redis/
kubectl delete -f kubernetes/rbac/
kubectl delete -f kubernetes/monitoring/grafana/
kubectl delete -f kubernetes/monitoring/prometheus/
kubectl delete -f kubernetes/ingress.yaml
kubectl delete -f kubernetes/monitoring.yaml
kubectl delete -f kubernetes/namespace.yaml
# Skipping job deletions (deprecated)

echo "Cleanup complete!"
