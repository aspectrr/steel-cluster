package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type K8sClient struct {
	clientset    *kubernetes.Clientset
	namespace    string
	browserImage string
	browserPort  int
}

func NewK8sClient(namespace, browserImage string, browserPort int) (*K8sClient, error) {
	config, err := rest.InClusterConfig()
	if err != nil {
		return nil, fmt.Errorf("in-cluster config: %w", err)
	}
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("clientset: %w", err)
	}
	return &K8sClient{
		clientset:    clientset,
		namespace:    namespace,
		browserImage: browserImage,
		browserPort:  browserPort,
	}, nil
}

// ─── Session Pods ──────────────────────────────────────────────

// CreateSessionPod creates a dedicated pod for a session.
func (k *K8sClient) CreateSessionPod(ctx context.Context, sessionID string) (string, error) {
	podName := fmt.Sprintf("browser-session-%s", sessionID)
	pod := k.makeBrowserPod(podName, sessionID, "active", fmt.Sprintf("/sessions/%s", sessionID))

	_, err := k.clientset.CoreV1().Pods(k.namespace).Create(ctx, pod, metav1.CreateOptions{})
	if err != nil {
		return "", fmt.Errorf("create pod: %w", err)
	}
	return podName, nil
}

// CreatePrewarmPod creates a warm standby pod with a unique name.
// It returns the pod name.
func (k *K8sClient) CreatePrewarmPod(ctx context.Context) (string, error) {
	podName := fmt.Sprintf("browser-warm-%s", generateShortID())

	pod := k.makeBrowserPod(podName, "", "prewarm", "")
	pod.Labels["prewarm"] = "true"

	_, err := k.clientset.CoreV1().Pods(k.namespace).Create(ctx, pod, metav1.CreateOptions{})
	if err != nil {
		return "", fmt.Errorf("create prewarm pod: %w", err)
	}
	slog.Info("Created prewarm pod", "podName", podName)
	return podName, nil
}

// makeBrowserPod builds a browser pod spec with common defaults.
func (k *K8sClient) makeBrowserPod(name, sessionID, role, basePath string) *corev1.Pod {
	labels := map[string]string{
		"app":  "browser-session",
		"role": role,
	}
	if sessionID != "" {
		labels["sessionId"] = sessionID
	}

	env := []corev1.EnvVar{
		{Name: "PORT", Value: fmt.Sprintf("%d", k.browserPort)},
		{Name: "NODE_ENV", Value: "production"},
		{Name: "CHROME_HEADLESS", Value: "true"},
		{Name: "SKIP_FINGERPRINT_INJECTION", Value: "true"},
	}
	if basePath != "" {
		env = append(env, corev1.EnvVar{Name: "BASE_PATH", Value: basePath})
	}

	return &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: k.namespace,
			Labels:    labels,
		},
		Spec: corev1.PodSpec{
			RestartPolicy: corev1.RestartPolicyAlways,
			Containers: []corev1.Container{
				{
					Name:            "browser",
					Image:           k.browserImage,
					ImagePullPolicy: corev1.PullIfNotPresent,
					Env:             env,
					Ports: []corev1.ContainerPort{
						{ContainerPort: int32(k.browserPort), Name: "http", Protocol: corev1.ProtocolTCP},
					},
					ReadinessProbe: &corev1.Probe{
						ProbeHandler: corev1.ProbeHandler{
							HTTPGet: &corev1.HTTPGetAction{
								Path:   "/v1/health",
								Port:   intstrFromInt(k.browserPort),
								Scheme: corev1.URISchemeHTTP,
							},
						},
						InitialDelaySeconds: 3,
						PeriodSeconds:       5,
						TimeoutSeconds:      5,
						FailureThreshold:    12,
					},
					Resources: corev1.ResourceRequirements{
						Requests: mustParseResources("256Mi", "200m"),
						Limits:   mustParseResources("512Mi", "500m"),
					},
				},
			},
		},
	}
}

// ─── Session Services ──────────────────────────────────────────

func (k *K8sClient) CreateSessionService(ctx context.Context, sessionID string) error {
	svcName := fmt.Sprintf("browser-session-%s", sessionID)

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      svcName,
			Namespace: k.namespace,
			Labels: map[string]string{
				"app":       "browser-session",
				"sessionId": sessionID,
			},
			Annotations: map[string]string{
				"steel/sessionId": sessionID,
			},
		},
		Spec: corev1.ServiceSpec{
			Type:     corev1.ServiceTypeClusterIP,
			Selector: map[string]string{"sessionId": sessionID},
			Ports: []corev1.ServicePort{
				{
					Name:       "http",
					Port:       int32(k.browserPort),
					TargetPort: intstrFromInt(k.browserPort),
					Protocol:   corev1.ProtocolTCP,
				},
			},
		},
	}

	_, err := k.clientset.CoreV1().Services(k.namespace).Create(ctx, svc, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("create service: %w", err)
	}
	return nil
}

// ─── Deletion ──────────────────────────────────────────────────

func (k *K8sClient) DeleteService(ctx context.Context, name string) {
	_ = k.clientset.CoreV1().Services(k.namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

func (k *K8sClient) DeletePod(ctx context.Context, name string) {
	_ = k.clientset.CoreV1().Pods(k.namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

// ─── Queries ───────────────────────────────────────────────────

type ServiceInfo struct {
	Name        string
	Annotations map[string]string
}

func (k *K8sClient) ListActiveServices(ctx context.Context) ([]ServiceInfo, error) {
	svcs, err := k.clientset.CoreV1().Services(k.namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}

	var result []ServiceInfo
	for _, svc := range svcs.Items {
		name := svc.Name
		labels := svc.Labels
		annotations := svc.Annotations
		if annotations == nil {
			annotations = map[string]string{}
		}

		isSession := (annotations["steel/sessionId"] != "") ||
			(labels["app"] == "browser-session") ||
			(len(name) > 17 && name[:17] == "browser-session-")

		if isSession && name != "browser-orchestrator" {
			result = append(result, ServiceInfo{
				Name:        name,
				Annotations: annotations,
			})
		}
	}
	return result, nil
}

func (k *K8sClient) GetPodIP(ctx context.Context, podName string) (string, error) {
	pod, err := k.clientset.CoreV1().Pods(k.namespace).Get(ctx, podName, metav1.GetOptions{})
	if err != nil {
		return "", fmt.Errorf("get pod: %w", err)
	}
	if pod.Status.PodIP == "" {
		return "", fmt.Errorf("pod %s has no IP yet", podName)
	}
	return pod.Status.PodIP, nil
}

// ─── Warm Pool Queries ─────────────────────────────────────────

// PrewarmPodInfo describes a warm standby pod.
type PrewarmPodInfo struct {
	Name  string
	Ready bool
	IP    string
}

// ListPrewarmPods returns all prewarm pods that are currently running.
func (k *K8sClient) ListPrewarmPods(ctx context.Context) ([]PrewarmPodInfo, error) {
	pods, err := k.clientset.CoreV1().Pods(k.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app=browser-session,role=prewarm",
	})
	if err != nil {
		return nil, err
	}

	var result []PrewarmPodInfo
	for _, pod := range pods.Items {
		if pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
			continue
		}
		ready := false
		for _, c := range pod.Status.Conditions {
			if c.Type == corev1.PodReady && c.Status == corev1.ConditionTrue {
				ready = true
			}
		}
		result = append(result, PrewarmPodInfo{
			Name:  pod.Name,
			Ready: ready,
			IP:    pod.Status.PodIP,
		})
	}
	return result, nil
}

// ClaimPrewarmPod takes a ready prewarm pod, relabels it for the given session,
// renames it to the canonical session pod name, and returns the new pod name.
// Since Kubernetes doesn't support renaming pods, we relabel in-place.
func (k *K8sClient) ClaimPrewarmPod(ctx context.Context, sessionID, podName string) error {
	// Relabel the pod: set role=active and add sessionId label
	patchLabels := map[string]interface{}{
		"metadata": map[string]interface{}{
			"labels": map[string]string{
				"role":      "active",
				"sessionId": sessionID,
				"prewarm":   "",
			},
		},
	}
	patchData, _ := json.Marshal(patchLabels)
	_, err := k.clientset.CoreV1().Pods(k.namespace).Patch(
		ctx, podName, "application/strategic-merge-patch+json", patchData, metav1.PatchOptions{},
	)
	if err != nil {
		return fmt.Errorf("patch prewarm pod labels: %w", err)
	}
	slog.Info("Claimed prewarm pod", "podName", podName, "sessionId", sessionID)
	return nil
}

// WaitForReadiness polls the service until it responds healthy or times out.
func (k *K8sClient) WaitForReadiness(ctx context.Context, serviceName string, timeout time.Duration) error {
	fqdn := fmt.Sprintf("%s.%s.svc.cluster.local", serviceName, k.namespace)
	healthURL := fmt.Sprintf("http://%s:%d/v1/health", fqdn, k.browserPort)
	client := &http.Client{Timeout: 3 * time.Second}

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := client.Get(healthURL)
		if err == nil && resp.StatusCode >= 200 && resp.StatusCode < 300 {
			resp.Body.Close()
			return nil
		}
		if resp != nil {
			resp.Body.Close()
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
		}
	}
	return fmt.Errorf("timed out waiting for service %s readiness", serviceName)
}
