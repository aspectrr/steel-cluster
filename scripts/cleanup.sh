#!/bin/bash

set -euo pipefail

echo "Cleaning up Browser Session Orchestrator (Helm)..."

# Optional toggles:
#   DELETE_NAMESPACE=true   -> delete the 'browser-sessions' namespace at the end
#   REMOVE_INGRESS=true     -> uninstall ingress-nginx Helm release and delete its namespace
DELETE_NAMESPACE="${DELETE_NAMESPACE:-false}"
REMOVE_INGRESS="${REMOVE_INGRESS:-false}"

# Delete session Services/Pods (active + prewarm) if namespace exists
if kubectl get namespace browser-sessions >/dev/null 2>&1; then
  echo "Deleting session Services and Pods in 'browser-sessions'..."
  # Delete per-session Services (role=active)
  kubectl delete service -l app=browser-session,role=active -n browser-sessions --ignore-not-found
  # Delete per-session Pods (role=active)
  kubectl delete pod -l app=browser-session,role=active -n browser-sessions --ignore-not-found
  # Delete prewarm Pods
  kubectl delete pod -l app=browser-session,role=prewarm -n browser-sessions --ignore-not-found

  # Uninstall Helm release for steel-cluster
  if helm status steel-cluster -n browser-sessions >/dev/null 2>&1; then
    echo "Uninstalling Helm release 'steel-cluster' in 'browser-sessions'..."
    helm uninstall steel-cluster -n browser-sessions || true
  else
    echo "Helm release 'steel-cluster' not found in 'browser-sessions'."
  fi

  # Optionally delete the namespace
  if [[ "${DELETE_NAMESPACE}" == "true" ]]; then
    echo "Deleting namespace 'browser-sessions'..."
    kubectl delete namespace browser-sessions --ignore-not-found
  fi
else
  echo "Namespace 'browser-sessions' does not exist; skipping label-based deletes and Helm uninstall."
fi

# Optionally remove ingress-nginx controller
if [[ "${REMOVE_INGRESS}" == "true" ]]; then
  echo "Removing ingress-nginx..."
  if helm status ingress-nginx -n ingress-nginx >/dev/null 2>&1; then
    helm uninstall ingress-nginx -n ingress-nginx || true
  fi
  kubectl delete namespace ingress-nginx --ignore-not-found
fi

echo "Cleanup complete!"
