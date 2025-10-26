import axios from "axios";
import {
  CoreV1Api,
  KubeConfig,
  type V1Pod,
  type V1Service,
  type V1ContainerPort,
  type V1Probe,
  type V1HTTPGetAction,
} from "@kubernetes/client-node";
import {
  K8S_NAMESPACE,
  BROWSER_IMAGE,
  BROWSER_PORT,
  POD_MEMORY_REQUEST,
  POD_CPU_REQUEST,
  POD_MEMORY_LIMIT,
  POD_CPU_LIMIT,
  IMAGE_PULL_SECRET,
  READINESS_INITIAL_DELAY,
  READINESS_PERIOD_SECONDS,
} from "./config";

/**
 * Kubernetes client (CoreV1Api), initialized from the default environment:
 * - In-cluster when running inside Kubernetes
 * - Local kubeconfig when running out-of-cluster (respects KUBECONFIG, defaults to ~/.kube/config)
 */
const kubeConfig = new KubeConfig();
kubeConfig.loadFromDefault();
export const core: CoreV1Api = kubeConfig.makeApiClient(CoreV1Api);

/**
 * Build the Cluster DNS hostname for a per-session Service.
 */
export function browserServiceHost(sessionId: string): string {
  return `browser-session-${sessionId}.${K8S_NAMESPACE}.svc.cluster.local`;
}

/**
 * Construct the readiness probe for the browser container.
 */
export function makeReadinessProbe(): V1Probe {
  const httpGet: V1HTTPGetAction = {
    path: "/v1/health",
    port: BROWSER_PORT,
    scheme: "HTTP",
  };
  return {
    httpGet,
    initialDelaySeconds: READINESS_INITIAL_DELAY,
    periodSeconds: READINESS_PERIOD_SECONDS,
    timeoutSeconds: 5,
    failureThreshold: 12,
    successThreshold: 1,
  };
}

/**
 * Container ports for the browser container.
 */
export function makeContainerPorts(): V1ContainerPort[] {
  return [
    {
      containerPort: BROWSER_PORT,
      name: "http",
      protocol: "TCP",
    },
  ];
}

/**
 * Deterministic pod name for a session.
 */
export function makeSessionPodName(sessionId: string): string {
  return `browser-session-${sessionId}`;
}

/**
 * Deterministic service name for a session.
 */
export function makeSessionServiceName(sessionId: string): string {
  return `browser-session-${sessionId}`;
}

/**
 * Create a dedicated Pod for a session and return its name.
 */
export async function createSessionPod(sessionId: string): Promise<string> {
  const name = makeSessionPodName(sessionId);

  const pod: V1Pod = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name,
      namespace: K8S_NAMESPACE,
      labels: {
        app: "browser-session",
        role: "active",
        sessionId,
        podName: name,
      },
    },
    spec: {
      restartPolicy: "Always",
      containers: [
        {
          name: "browser",
          image: BROWSER_IMAGE,
          imagePullPolicy: "IfNotPresent",
          env: [
            { name: "PORT", value: String(BROWSER_PORT) },
            { name: "NODE_ENV", value: "production" },
            { name: "BASE_PATH", value: `/sessions/${sessionId}` },
          ],
          ports: makeContainerPorts(),
          readinessProbe: makeReadinessProbe(),
          resources: {
            requests: { memory: POD_MEMORY_REQUEST, cpu: POD_CPU_REQUEST },
            limits: { memory: POD_MEMORY_LIMIT, cpu: POD_CPU_LIMIT },
          },
        },
      ],
      ...(IMAGE_PULL_SECRET
        ? {
            imagePullSecrets: [{ name: IMAGE_PULL_SECRET }],
          }
        : {}),
    },
  };

  await core.createNamespacedPod({ namespace: K8S_NAMESPACE, body: pod });
  return name;
}

/**
 * Create a ClusterIP Service for a session and return its name.
 * The selector determines which Pod(s) are targeted.
 * Additional annotations can be provided and are merged with steel/* defaults.
 */
export async function createSessionService(
  sessionId: string,
  selector: Record<string, string>,
  annotations?: Record<string, string>,
): Promise<string> {
  const name = makeSessionServiceName(sessionId);
  const mergedAnnotations: Record<string, string> = {
    "steel/sessionId": sessionId,
    ...(selector.podName ? { "steel/targetPodName": selector.podName } : {}),
    ...(annotations || {}),
  };

  const service: V1Service = {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name,
      namespace: K8S_NAMESPACE,
      labels: {
        app: "browser-session",
        sessionId,
      },
      annotations: mergedAnnotations,
    },
    spec: {
      type: "ClusterIP",
      selector,
      ports: [
        {
          name: "http",
          port: BROWSER_PORT,
          targetPort: BROWSER_PORT,
          protocol: "TCP",
        },
      ],
    },
  };

  await core.createNamespacedService({
    namespace: K8S_NAMESPACE,
    body: service,
  });
  return name;
}

/**
 * Delete a Service by name, ignoring NotFound errors.
 */
export async function deleteService(name: string): Promise<void> {
  try {
    await core.deleteNamespacedService({ name, namespace: K8S_NAMESPACE });
  } catch (err: any) {
    const code =
      err?.response?.status ??
      err?.statusCode ??
      err?.body?.code ??
      err?.code ??
      undefined;
    if (code === 404) {
      return;
    }
    // Re-throw other errors
    throw err;
  }
}

/**
 * Delete a Pod by name, ignoring NotFound errors.
 */
export async function deletePod(name: string): Promise<void> {
  try {
    await core.deleteNamespacedPod({ name, namespace: K8S_NAMESPACE });
  } catch (err: any) {
    const code =
      err?.response?.status ??
      err?.statusCode ??
      err?.body?.code ??
      err?.code ??
      undefined;
    if (code === 404) {
      return;
    }
    // Re-throw other errors
    throw err;
  }
}

/**
 * Return union of prewarm pods identified by labels and name prefix.
 */
export async function listPrewarmPods(): Promise<V1Pod[]> {
  const res = await core.listNamespacedPod({ namespace: K8S_NAMESPACE });
  const all = res.items || [];

  const unionMap: Record<string, V1Pod> = {};
  for (const p of all) {
    const name = p.metadata?.name ?? "";
    const labels = p.metadata?.labels || {};
    const isLabelMatch =
      labels.app === "browser-session" && labels.role === "prewarm";
    const isPrefixMatch = name.startsWith("browser-prewarm-");
    if (isLabelMatch || isPrefixMatch) {
      unionMap[name] = p;
    }
  }
  return Object.values(unionMap);
}

/**
 * Return union of active session services identified by annotations, labels, and name prefix.
 */
export async function listActiveServices(): Promise<V1Service[]> {
  const res = await core.listNamespacedService({ namespace: K8S_NAMESPACE });
  const all = res.items || [];

  const unionMap: Record<string, V1Service> = {};
  for (const s of all) {
    const name = s.metadata?.name ?? "";
    const labels = s.metadata?.labels || {};
    const annotations = s.metadata?.annotations || {};
    const byAnnotation = Boolean(annotations["steel/sessionId"]);
    const byLabel = labels.app === "browser-session";
    const byPrefix = name.startsWith("browser-session-");

    if (byAnnotation || byLabel || byPrefix) {
      unionMap[name] = s;
    }
  }
  return Object.values(unionMap);
}

/**
 * Check if a Pod is Ready based on its status conditions.
 */
export function isPodReady(pod: V1Pod): boolean {
  const conditions = pod.status?.conditions || [];
  return conditions.some((c) => c.type === "Ready" && c.status === "True");
}

/**
 * Poll the per-session Service readiness endpoint until success or timeout.
 * Targets: http://<service>.<namespace>.svc.cluster.local:<port>/v1/health
 */
export async function waitForServiceReadiness(
  serviceName: string,
  timeoutSeconds: number,
): Promise<void> {
  const fqdn = `${serviceName}.${K8S_NAMESPACE}.svc.cluster.local`;
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastErr: unknown = null;

  while (Date.now() < deadline) {
    try {
      const url = `http://${fqdn}:${BROWSER_PORT}/v1/health`;
      const res = await axios.get(url, { timeout: 3000 });
      if (res.status >= 200 && res.status < 300) {
        return;
      }
      lastErr = new Error(`Unexpected HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(
    `Timed out waiting for service ${serviceName} readiness: ${lastErr ? String(lastErr) : "unknown error"}`,
  );
}
