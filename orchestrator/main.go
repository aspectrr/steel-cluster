// @title Steel Cluster Orchestrator API
// @version 1.0.0
// @description Kubernetes-based browser session orchestrator. Creates isolated browser pods per session, routes HTTP and WebSocket (CDP) traffic, and maintains a warm pool for fast session startup.
// @host localhost:3000
// @BasePath /v1
// @license.name MIT
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/swaggo/swag"

	_ "github.com/steel-cluster/orchestrator/docs"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// ─── Config ──────────────────────────────────────────────

type Config struct {
	Port                  string
	Namespace             string
	BrowserImage          string
	BrowserPort           int
	RedisHost             string
	RedisPort             int
	SessionTimeoutDefault int
	MaxSessions           int
	BasePath              string
	WarmPoolSize          int
}

func LoadConfig() Config {
	return Config{
		Port:                  envOrDefault("PORT", "3000"),
		Namespace:             envOrDefault("K8S_NAMESPACE", "browser-sessions"),
		BrowserImage:          envOrDefault("BROWSER_IMAGE", "ghcr.io/steel-dev/steel-browser-api:latest"),
		BrowserPort:           envOrDefaultInt("BROWSER_PORT", 3000),
		RedisHost:             envOrDefault("REDIS_HOST", "localhost"),
		RedisPort:             envOrDefaultInt("REDIS_PORT", 6379),
		SessionTimeoutDefault: envOrDefaultInt("SESSION_TIMEOUT", 1800),
		MaxSessions:           envOrDefaultInt("MAX_SESSIONS", 100),
		BasePath:              strings.TrimRight(envOrDefault("BASE_PATH", ""), "/"),
		WarmPoolSize:          envOrDefaultInt("WARM_POOL_SIZE", 2),
	}
}

func envOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envOrDefaultInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := fmt.Sscanf(v, "%d", &def)
	if err != nil || n != 1 {
		return def
	}
	return def
}

// ─── Types ──────────────────────────────────────────────

type SessionData struct {
	ID             string         `json:"id"`
	Status         string         `json:"status"`
	CreatedAt      string         `json:"createdAt"`
	LastUsed       string         `json:"lastUsed"`
	TimeoutSeconds int            `json:"timeoutSeconds"`
	ServiceName    string         `json:"serviceName"`
	PodName        string         `json:"podName"`
	ServiceHost    string         `json:"serviceHost"`
	Notes          string         `json:"notes,omitempty"`
	Options        map[string]any `json:"options,omitempty"`
}

type HealthResponse struct {
	Status       string `json:"status"`
	Sessions     int    `json:"sessions"`
	WarmPoolSize int    `json:"warmPoolReady"`
	Namespace    string `json:"namespace"`
	BasePath     string `json:"basePath"`
	Timestamp    string `json:"timestamp"`
}

// ─── Orchestrator ──────────────────────────────────────────────

type Orchestrator struct {
	config Config
	k8s    *K8sClient
	redis  *RedisStore

	// warmMu guards access to the warm pool claim logic.
	warmMu sync.Mutex
}

func NewOrchestrator(cfg Config) (*Orchestrator, error) {
	k8s, err := NewK8sClient(cfg.Namespace, cfg.BrowserImage, cfg.BrowserPort)
	if err != nil {
		return nil, fmt.Errorf("k8s client: %w", err)
	}

	redis, err := NewRedisStore(cfg.RedisHost, cfg.RedisPort)
	if err != nil {
		return nil, fmt.Errorf("redis: %w", err)
	}

	return &Orchestrator{
		config: cfg,
		k8s:    k8s,
		redis:  redis,
	}, nil
}

// ─── Route Registration ───────────────────────────────────────

func (o *Orchestrator) RegisterRoutes(r *gin.Engine) {
	v1 := r.Group(o.config.BasePath + "/v1")

	v1.POST("/sessions", o.createSession)
	v1.GET("/sessions", o.listSessions)
	v1.POST("/sessions/release", o.releaseAllSessions)
	v1.GET("/health", o.health)

	// Individual session routes.
	v1.GET("/sessions/:sessionId", o.getSessionDetails)
	v1.GET("/sessions/:sessionId/status", o.getSessionStatus)
	v1.POST("/sessions/:sessionId/release", o.releaseSession)

	// Proxy catch-all (all methods, remaining paths).
	v1.Any("/sessions/:sessionId/*path", o.proxyToSession)
}

// ─── Browser Forwarding ────────────────────────────────────────

// forwardToBrowser sends an HTTP request to the browser pod and returns the
// status code and raw response body. Used to proxy Steel API requests through
// the orchestrator so responses match the upstream Steel browser format.
func (o *Orchestrator) forwardToBrowser(ctx context.Context, session SessionData, method, path string, body io.Reader) (int, []byte, error) {
	targetURL := fmt.Sprintf("http://%s:%d%s", session.ServiceHost, o.config.BrowserPort, path)

	req, err := http.NewRequestWithContext(ctx, method, targetURL, body)
	if err != nil {
		return 0, nil, fmt.Errorf("create request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("forward request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, nil, fmt.Errorf("read response: %w", err)
	}

	return resp.StatusCode, respBody, nil
}

// ─── HTTP Handlers ─────────────────────────────────────────────

// POST /v1/sessions — Create a new browser session.
// Tries to claim a warm pod first; falls back to creating a fresh pod.
// After k8s resources are ready, forwards the creation request to the browser
// pod so the response matches the upstream Steel SessionDetails format.
//
// @Summary      Create a browser session
// @Description  Creates a new browser session with an isolated pod. Claims a warm pod if available (~85ms), otherwise creates a fresh pod (~30s cold start).
// @Tags         sessions
// @Accept       json
// @Produce      json
// @Param        body  body  object  false  "Session options"
// @Success      201   {object}  map[string]any
// @Failure      400   {object}  map[string]any
// @Failure      429   {object}  map[string]any
// @Failure      500   {object}  map[string]any
// @Router       /sessions [post]
func (o *Orchestrator) createSession(c *gin.Context) {
	// Read raw body so we can forward it to the browser pod.
	bodyBytes, _ := io.ReadAll(c.Request.Body)
	if len(bodyBytes) == 0 {
		bodyBytes = []byte("{}")
	}

	// Parse only the orchestrator-specific fields.
	var parsed struct {
		Timeout int            `json:"timeout"`
		Options map[string]any `json:"options"`
	}
	if len(bodyBytes) > 2 {
		if err := json.Unmarshal(bodyBytes, &parsed); err != nil {
			slog.Debug("Failed to parse session body, using defaults", "error", err)
		}
	}
	timeout := parsed.Timeout
	if timeout == 0 {
		timeout = o.config.SessionTimeoutDefault
	}

	sessionID := uuid.New().String()
	serviceName := fmt.Sprintf("browser-session-%s", sessionID)
	serviceHost := fmt.Sprintf("%s.%s.svc.cluster.local", serviceName, o.config.Namespace)

	session := SessionData{
		ID:             sessionID,
		Status:         "pending",
		CreatedAt:      time.Now().UTC().Format(time.RFC3339),
		LastUsed:       time.Now().UTC().Format(time.RFC3339),
		TimeoutSeconds: timeout,
		ServiceName:    serviceName,
		ServiceHost:    serviceHost,
		Options:        parsed.Options,
	}

	// Check max sessions and claim warm pod atomically to prevent TOCTOU races.
	o.warmMu.Lock()
	active, err := o.k8s.ListActiveServices(c.Request.Context())
	if err == nil && len(active) >= o.config.MaxSessions {
		o.warmMu.Unlock()
		c.JSON(429, gin.H{"message": "Max sessions reached", "error": "Max sessions reached"})
		return
	}

	// Try to claim a warm pod while still holding the lock.
	var podName string
	claimed := o.claimWarmPodLocked(c.Request.Context(), sessionID)
	o.warmMu.Unlock()

	// Save initial state so janitor doesn't clean it up.
	if err := o.redis.SaveSession(c.Request.Context(), session); err != nil {
		slog.Error("Failed to save session", "error", err, "sessionId", sessionID)
	}

	if claimed != "" {
		podName = claimed
		slog.Info("Claimed warm pod for session", "podName", podName, "sessionId", sessionID)
		// Kick off a replacement warm pod in the background.
		go o.spawnWarmPod()
	} else {
		// Fallback: create a fresh pod (cold start).
		pod, err := o.k8s.CreateSessionPod(c.Request.Context(), sessionID)
		if err != nil {
			session.Status = "failed"
			session.Notes = fmt.Sprintf("Failed to create pod: %v", err)
			_ = o.redis.SaveSession(c.Request.Context(), session)
			c.JSON(500, gin.H{"message": session.Notes, "error": "Failed to create pod"})
			return
		}
		podName = pod
	}
	session.PodName = podName

	// Create service pointing to the pod.
	if err := o.k8s.CreateSessionService(c.Request.Context(), sessionID); err != nil {
		session.Status = "failed"
		session.Notes = fmt.Sprintf("Failed to create service: %v", err)
		_ = o.redis.SaveSession(c.Request.Context(), session)
		o.k8s.DeletePod(c.Request.Context(), podName)
		c.JSON(500, gin.H{"message": session.Notes, "error": "Failed to create service"})
		return
	}

	// If we used a warm pod, skip readiness wait — it's already ready.
	// For cold-start pods, wait for readiness.
	if claimed == "" {
		if err := o.k8s.WaitForReadiness(c.Request.Context(), serviceName, 60*time.Second); err != nil {
			session.Status = "failed"
			session.Notes = fmt.Sprintf("Readiness failed: %v", err)
			_ = o.redis.SaveSession(c.Request.Context(), session)
			o.k8s.DeleteService(c.Request.Context(), serviceName)
			o.k8s.DeletePod(c.Request.Context(), podName)
			c.JSON(500, gin.H{"message": session.Notes, "error": "Readiness failed"})
			return
		}
	} else {
		// Warm pod: the pod is ready but the service may not be routable yet.
		// Do a shorter readiness wait to ensure DNS propagates.
		if err := o.k8s.WaitForReadiness(c.Request.Context(), serviceName, 15*time.Second); err != nil {
			slog.Warn("Service not routable for warm pod, will attempt forward anyway", "error", err, "sessionId", sessionID)
		}
	}

	session.Status = "live"
	_ = o.redis.SaveSession(c.Request.Context(), session)
	slog.Info("Session live", "sessionId", sessionID, "podName", podName, "warm", claimed != "")

	// Inject the orchestrator session ID into the forwarded request body
	// so the browser pod uses our session ID.
	var forwardBody map[string]any
	_ = json.Unmarshal(bodyBytes, &forwardBody)
	if forwardBody == nil {
		forwardBody = map[string]any{}
	}
	forwardBody["sessionId"] = sessionID
	forwardBodyBytes, _ := json.Marshal(forwardBody)

	// Forward the create request to the browser pod.
	status, respBody, fwdErr := o.forwardToBrowser(
		c.Request.Context(), session,
		http.MethodPost, "/v1/sessions",
		bytes.NewReader(forwardBodyBytes),
	)
	if fwdErr != nil {
		// Browser pod unreachable — return a minimal Steel-compatible response.
		slog.Warn("Failed to forward create to browser pod, returning orchestrator response", "error", fwdErr, "sessionId", sessionID)
		c.JSON(201, gin.H{
			"id":               sessionID,
			"createdAt":        session.CreatedAt,
			"status":           "live",
			"duration":         0,
			"eventCount":       0,
			"timeout":          timeout * 1000,
			"dimensions":       nil,
			"websocketUrl":     "",
			"debugUrl":         "",
			"sessionViewerUrl": "",
			"userAgent":        "",
		})
		return
	}

	// Return the browser pod's response as-is.
	c.Data(status, "application/json", respBody)
}

// GET /v1/sessions — List all sessions.
// Queries each live browser pod for full Steel SessionDetails.
//
// @Summary      List all sessions
// @Description  Returns all active and recent sessions with full Steel API details.
// @Tags         sessions
// @Produce      json
// @Success      200  {object}  map[string]any
// @Router       /sessions [get]
func (o *Orchestrator) listSessions(c *gin.Context) {
	sessions, err := o.redis.ListSessions(c.Request.Context())
	if err != nil {
		c.JSON(500, gin.H{"message": err.Error(), "error": "Failed to list sessions"})
		return
	}
	if sessions == nil {
		c.JSON(200, gin.H{"sessions": []any{}, "totalCount": 0})
		return
	}

	type listResult struct {
		index    int
		details  json.RawMessage
		fallback SessionData
	}

	results := make([]listResult, len(sessions))
	var wg sync.WaitGroup

	for i, s := range sessions {
		wg.Add(1)
		go func(idx int, sess SessionData) {
			defer wg.Done()
			if sess.Status != "live" {
				results[idx] = listResult{index: idx, fallback: sess}
				return
			}
			status, body, fwdErr := o.forwardToBrowser(
				c.Request.Context(), sess,
				http.MethodGet, fmt.Sprintf("/v1/sessions/%s", sess.ID), nil,
			)
			if fwdErr != nil || status != 200 {
				results[idx] = listResult{index: idx, fallback: sess}
				return
			}
			results[idx] = listResult{index: idx, details: json.RawMessage(body)}
		}(i, s)
	}
	wg.Wait()

	var out []json.RawMessage
	for _, r := range results {
		if r.details != nil {
			out = append(out, r.details)
		} else {
			// Fallback: return orchestrator data in a Steel-compatible shape.
			fb, _ := json.Marshal(gin.H{
				"id":         r.fallback.ID,
				"createdAt":  r.fallback.CreatedAt,
				"status":     r.fallback.Status,
				"duration":   0,
				"eventCount": 0,
				"timeout":    r.fallback.TimeoutSeconds * 1000,
			})
			out = append(out, fb)
		}
	}

	c.JSON(200, gin.H{"sessions": out, "totalCount": len(out)})
}

// GET /v1/sessions/:sessionId — Get session details.
// Proxies to the browser pod to return the full Steel SessionDetails format.
//
// @Summary      Get session details
// @Description  Returns full session data in the Steel API format.
// @Tags         sessions
// @Produce      json
// @Param        sessionId  path  string  true  "Session ID"
// @Success      200  {object}  map[string]any
// @Failure      400  {object}  map[string]any
// @Failure      404  {object}  map[string]any
// @Failure      500  {object}  map[string]any
// @Router       /sessions/{sessionId} [get]
func (o *Orchestrator) getSessionDetails(c *gin.Context) {
	sessionID := c.Param("sessionId")
	session, err := o.redis.GetSession(c.Request.Context(), sessionID)
	if err != nil {
		c.JSON(404, gin.H{"message": "Session not found", "error": "Session not found"})
		return
	}

	if session.Status != "live" {
		// Return a Steel-compatible response for non-live sessions.
		c.JSON(200, gin.H{
			"id":         session.ID,
			"createdAt":  session.CreatedAt,
			"status":     session.Status,
			"duration":   0,
			"eventCount": 0,
			"timeout":    session.TimeoutSeconds * 1000,
		})
		return
	}

	// Forward to the browser pod for full Steel SessionDetails.
	status, respBody, fwdErr := o.forwardToBrowser(
		c.Request.Context(), session,
		http.MethodGet, fmt.Sprintf("/v1/sessions/%s", sessionID), nil,
	)
	if fwdErr != nil {
		slog.Warn("Failed to forward session details to browser pod", "error", fwdErr, "sessionId", sessionID)
		c.JSON(500, gin.H{"message": "Browser pod unreachable", "error": fwdErr.Error()})
		return
	}

	c.Data(status, "application/json", respBody)
}

// GET /v1/sessions/:sessionId/status — Get session status.
//
// @Summary      Get session status
// @Description  Returns the current status and health of a session.
// @Tags         sessions
// @Produce      json
// @Param        sessionId  path  string  true  "Session ID"
// @Success      200  {object}  map[string]any
// @Failure      404  {object}  map[string]string
// @Router       /sessions/{sessionId}/status [get]
func (o *Orchestrator) getSessionStatus(c *gin.Context) {
	sessionID := c.Param("sessionId")
	session, err := o.redis.GetSession(c.Request.Context(), sessionID)
	if err != nil {
		c.JSON(404, gin.H{"error": "Session not found"})
		return
	}
	c.JSON(200, gin.H{
		"id": session.ID, "status": session.Status, "healthy": session.Status == "live",
	})
}

// POST /v1/sessions/:sessionId/release — Release a single session.
// Forwards the release to the browser pod first, then cleans up k8s resources.
//
// @Summary      Release a session
// @Description  Releases the session, its pod, and service.
// @Tags         sessions
// @Produce      json
// @Param        sessionId  path  string  true  "Session ID"
// @Success      200  {object}  map[string]any
// @Failure      400  {object}  map[string]any
// @Failure      429  {object}  map[string]any
// @Failure      500  {object}  map[string]any
// @Router       /sessions/{sessionId}/release [post]
func (o *Orchestrator) releaseSession(c *gin.Context) {
	sessionID := c.Param("sessionId")
	session, err := o.redis.GetSession(c.Request.Context(), sessionID)

	// Forward release to the browser pod first (if session is live).
	if err == nil && session.Status == "live" {
		status, respBody, fwdErr := o.forwardToBrowser(
			c.Request.Context(), session,
			http.MethodPost, fmt.Sprintf("/v1/sessions/%s/release", sessionID), nil,
		)
		if fwdErr != nil {
			slog.Warn("Failed to forward release to browser pod", "error", fwdErr, "sessionId", sessionID)
		}

		// Clean up k8s resources regardless of browser pod response.
		if session.ServiceName != "" {
			o.k8s.DeleteService(c.Request.Context(), session.ServiceName)
		}
		if session.PodName != "" {
			o.k8s.DeletePod(c.Request.Context(), session.PodName)
		}
		_ = o.redis.DeleteSession(c.Request.Context(), sessionID)
		slog.Info("Session deleted", "sessionId", sessionID)

		if fwdErr == nil {
			c.Data(status, "application/json", respBody)
			return
		}
	} else {
		// Session not in Redis or not live — just clean up what we can.
		if err == nil {
			if session.ServiceName != "" {
				o.k8s.DeleteService(c.Request.Context(), session.ServiceName)
			}
			if session.PodName != "" {
				o.k8s.DeletePod(c.Request.Context(), session.PodName)
			}
			_ = o.redis.DeleteSession(c.Request.Context(), sessionID)
		}
	}

	c.JSON(200, gin.H{"success": true, "message": fmt.Sprintf("Session %s released", sessionID)})
}

// POST /v1/sessions/release — Release ALL sessions.
//
// @Summary      Release all sessions
// @Description  Releases all sessions, their pods, and services.
// @Tags         sessions
// @Produce      json
// @Success      200  {object}  map[string]any
// @Failure      400  {object}  map[string]any
// @Failure      500  {object}  map[string]any
// @Router       /sessions/release [post]
func (o *Orchestrator) releaseAllSessions(c *gin.Context) {
	sessions, err := o.redis.ListSessions(c.Request.Context())
	if err != nil {
		c.JSON(500, gin.H{"message": err.Error(), "error": "Failed to list sessions"})
		return
	}

	if sessions == nil {
		c.JSON(200, gin.H{"success": true, "message": "No sessions to release"})
		return
	}

	deleted := 0
	for _, s := range sessions {
		if s.Status == "live" {
			// Forward release to browser pod (best-effort).
			_, _, fwdErr := o.forwardToBrowser(
				c.Request.Context(), s,
				http.MethodPost, fmt.Sprintf("/v1/sessions/%s/release", s.ID), nil,
			)
			if fwdErr != nil {
				slog.Warn("Failed to forward release to browser pod", "error", fwdErr, "sessionId", s.ID)
			}
		}
		if s.ServiceName != "" {
			o.k8s.DeleteService(c.Request.Context(), s.ServiceName)
		}
		if s.PodName != "" {
			o.k8s.DeletePod(c.Request.Context(), s.PodName)
		}
		_ = o.redis.DeleteSession(c.Request.Context(), s.ID)
		deleted++
	}

	slog.Info("Released all sessions", "count", deleted)
	c.JSON(200, gin.H{"success": true, "message": fmt.Sprintf("Released %d sessions", deleted)})
}

// GET /v1/health — Health check.
//
// @Summary      Health check
// @Description  Returns orchestrator health, active session count, and warm pool status.
// @Tags         system
// @Produce      json
// @Success      200  {object}  HealthResponse
// @Router       /health [get]
func (o *Orchestrator) health(c *gin.Context) {
	sessions, _ := o.redis.ListSessions(c.Request.Context())
	count := 0
	if sessions != nil {
		count = len(sessions)
	}

	// Count ready warm pods.
	warmReady := 0
	prewarms, _ := o.k8s.ListPrewarmPods(c.Request.Context())
	for _, p := range prewarms {
		if p.Ready {
			warmReady++
		}
	}

	c.JSON(200, HealthResponse{
		Status:       "ok",
		Sessions:     count,
		WarmPoolSize: warmReady,
		Namespace:    o.config.Namespace,
		BasePath:     o.config.BasePath,
		Timestamp:    time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Warm Pool ─────────────────────────────────────────────────

// claimWarmPodLocked finds a ready prewarm pod, relabels it for the session,
// and returns the pod name. Returns "" if no warm pod is available.
// Caller must hold warmMu.
func (o *Orchestrator) claimWarmPodLocked(ctx context.Context, sessionID string) string {
	prewarms, err := o.k8s.ListPrewarmPods(ctx)
	if err != nil {
		slog.Warn("Failed to list prewarm pods", "error", err)
		return ""
	}

	for _, p := range prewarms {
		if !p.Ready {
			continue
		}
		// Relabel the pod for this session.
		if err := o.k8s.ClaimPrewarmPod(ctx, sessionID, p.Name); err != nil {
			slog.Warn("Failed to claim prewarm pod", "podName", p.Name, "error", err)
			continue
		}
		return p.Name
	}
	return ""
}

// spawnWarmPod creates a new prewarm pod. Non-blocking; errors are logged.
func (o *Orchestrator) spawnWarmPod() {
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	name, err := o.k8s.CreatePrewarmPod(ctx)
	if err != nil {
		slog.Error("Failed to create warm pod", "error", err)
		return
	}
	slog.Info("Warm pod spawning", "podName", name)
}

// maintainWarmPool is a background goroutine that ensures the warm pool stays full.
func (o *Orchestrator) maintainWarmPool(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			o.replenishWarmPool(ctx)
		}
	}
}

func (o *Orchestrator) replenishWarmPool(ctx context.Context) {
	if o.config.WarmPoolSize <= 0 {
		return
	}

	prewarms, err := o.k8s.ListPrewarmPods(ctx)
	if err != nil {
		slog.Warn("Warm pool: failed to list pods", "error", err)
		return
	}

	// Count only pods that are running (even if not yet ready).
	liveCount := len(prewarms)
	needed := o.config.WarmPoolSize - liveCount

	for i := 0; i < needed; i++ {
		name, err := o.k8s.CreatePrewarmPod(ctx)
		if err != nil {
			slog.Error("Warm pool: failed to create pod", "error", err)
			return
		}
		slog.Info("Warm pool: created replacement pod", "podName", name)
	}
}

// seedWarmPool creates the initial warm pods on startup.
func (o *Orchestrator) seedWarmPool(ctx context.Context) {
	if o.config.WarmPoolSize <= 0 {
		return
	}
	slog.Info("Seeding warm pool", "targetSize", o.config.WarmPoolSize)
	o.replenishWarmPool(ctx)
}

// ─── HTTP Proxy ────────────────────────────────────────────────

func (o *Orchestrator) proxyToSession(c *gin.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		c.JSON(400, gin.H{"error": "Missing sessionId"})
		return
	}

	session, err := o.redis.GetSession(c.Request.Context(), sessionID)
	if err != nil {
		c.JSON(404, gin.H{"error": "Session not found"})
		return
	}

	// Touch session.
	session.LastUsed = time.Now().UTC().Format(time.RFC3339)
	_ = o.redis.SaveSession(c.Request.Context(), session)

	if session.Status != "live" {
		c.JSON(409, gin.H{"error": fmt.Sprintf("Session not ready: %s", session.Status)})
		return
	}

	suffix := c.Param("path")
	suffix = strings.TrimPrefix(suffix, "/")

	// CDP endpoints (/json/*, /devtools/*) go to port 9223 via pod IP.
	isCDP := strings.HasPrefix(suffix, "json/") || strings.HasPrefix(suffix, "devtools/")
	var targetURL string
	if isCDP {
		podIP, err := o.k8s.GetPodIP(c.Request.Context(), session.PodName)
		if err != nil {
			c.JSON(500, gin.H{"error": fmt.Sprintf("Failed to get pod IP: %v", err)})
			return
		}
		targetURL = fmt.Sprintf("http://%s:9223", podIP)
	} else {
		targetURL = fmt.Sprintf("http://%s:%d", session.ServiceHost, o.config.BrowserPort)
	}

	// Build the forwarded path.
	// Steel API endpoints go to the browser pod with the full path.
	// CDP endpoints (/json/*, /devtools/*) go directly to Chrome on port 9223.
	var forwardPath string
	if isCDP {
		forwardPath = "/" + suffix
	} else {
		forwardPath = fmt.Sprintf("/v1/sessions/%s/%s", sessionID, suffix)
	}

	target, _ := url.Parse(targetURL)
	proxy := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = target.Scheme
			req.URL.Host = target.Host
			req.URL.Path = forwardPath
			req.Host = target.Host
			if req.Response != nil {
				req.Response = nil
			}
		},
		Transport: &http.Transport{
			DialContext: (&net.Dialer{Timeout: 10 * time.Second}).DialContext,
		},
	}
	proxy.ServeHTTP(c.Writer, c.Request)
}

// ─── WebSocket Proxy ───────────────────────────────────────────

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func (o *Orchestrator) handleWebSocketProxy(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if o.config.BasePath != "" {
		path = strings.TrimPrefix(path, o.config.BasePath)
	}
	path = strings.TrimPrefix(path, "/v1/sessions/")

	cdpIdx := strings.Index(path, "/cdp/")
	if cdpIdx == -1 {
		http.Error(w, "Invalid CDP path", http.StatusBadRequest)
		return
	}
	sessionID := path[:cdpIdx]
	suffix := path[cdpIdx+5:]

	session, err := o.redis.GetSession(r.Context(), sessionID)
	if err != nil || session.Status != "live" {
		http.Error(w, "Session not found or not live", http.StatusNotFound)
		return
	}

	podIP, err := o.k8s.GetPodIP(r.Context(), session.PodName)
	if err != nil {
		http.Error(w, "Failed to get pod IP", http.StatusInternalServerError)
		return
	}

	upstreamURL := fmt.Sprintf("ws://%s:9223/%s", podIP, suffix)
	slog.Info("Proxying WebSocket to browser pod CDP", "wsUrl", upstreamURL, "sessionId", sessionID)

	clientWS, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("WS upgrade failed", "error", err)
		return
	}
	defer clientWS.Close()

	upstreamWS, _, err := websocket.DefaultDialer.Dial(upstreamURL, nil)
	if err != nil {
		slog.Error("Upstream WS dial failed", "error", err, "url", upstreamURL)
		return
	}
	defer upstreamWS.Close()

	done := make(chan struct{}, 2)

	// Client → Upstream
	go func() {
		defer func() { done <- struct{}{} }()
		for {
			msgType, msg, err := clientWS.ReadMessage()
			if err != nil {
				_ = upstreamWS.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
				return
			}
			if err := upstreamWS.WriteMessage(msgType, msg); err != nil {
				return
			}
		}
	}()

	// Upstream → Client
	go func() {
		defer func() { done <- struct{}{} }()
		for {
			msgType, msg, err := upstreamWS.ReadMessage()
			if err != nil {
				_ = clientWS.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
				return
			}
			if err := clientWS.WriteMessage(msgType, msg); err != nil {
				return
			}
		}
	}()

	<-done
}

// ─── WS Middleware ──────────────────────────────────────────────

func (o *Orchestrator) wsProxyMiddleware(c *gin.Context) {
	if !websocket.IsWebSocketUpgrade(c.Request) {
		c.Next()
		return
	}

	path := c.Request.URL.Path
	if o.config.BasePath != "" {
		path = strings.TrimPrefix(path, o.config.BasePath)
	}
	if !strings.Contains(path, "/cdp/") {
		c.Next()
		return
	}

	o.handleWebSocketProxy(c.Writer, c.Request)
	c.Abort()
}

// ─── Main ──────────────────────────────────────────────────────

// swaggerJSON is populated at build time by swag (via docs package init).
var swaggerJSON string

func init() {
	// The docs package init() runs first and registers the spec with swag.
	// We read it back to serve at /documentation/json.
	swagDoc, _ := swag.ReadDoc()
	swaggerJSON = swagDoc
}

// scalarHTML serves the Scalar API documentation UI.
const scalarHTML = `<!DOCTYPE html>
<html>
<head>
  <title>Steel Cluster API Docs</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; }
  </style>
</head>
<body>
  <script id="api-reference" data-url="/documentation/json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`

func main() {
	cfg := LoadConfig()
	slog.Info("Startup configuration",
		"namespace", cfg.Namespace,
		"port", cfg.Port,
		"basePath", cfg.BasePath,
		"warmPoolSize", cfg.WarmPoolSize,
	)

	orch, err := NewOrchestrator(cfg)
	if err != nil {
		slog.Error("Failed to create orchestrator", "error", err)
		os.Exit(1)
	}

	// Background contexts.
	bgCtx, bgCancel := context.WithCancel(context.Background())
	defer bgCancel()

	// Seed the warm pool.
	go orch.seedWarmPool(bgCtx)

	// Start warm pool maintainer.
	go orch.maintainWarmPool(bgCtx)

	// Start janitor.
	go orch.startJanitor(bgCtx)

	// Setup Gin.
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.RedirectTrailingSlash = true
	r.Use(gin.Recovery())
	r.Use(gin.Logger())

	// CORS.
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// WS proxy middleware runs before route matching.
	r.Use(orch.wsProxyMiddleware)

	orch.RegisterRoutes(r)

	// Documentation — Scalar API docs
	r.GET("/documentation", func(c *gin.Context) {
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(200, scalarHTML)
	})
	r.GET("/documentation/json", func(c *gin.Context) {
		c.Header("Content-Type", "application/json")
		c.String(200, swaggerJSON)
	})

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		slog.Info("Shutting down...")
		bgCancel()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()

	slog.Info("Orchestrator listening", "port", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("Server error", "error", err)
		os.Exit(1)
	}
}

// ─── Janitor ───────────────────────────────────────────────────

func (o *Orchestrator) startJanitor(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			o.cleanupOrphans(ctx)
		}
	}
}

func (o *Orchestrator) cleanupOrphans(ctx context.Context) {
	services, err := o.k8s.ListActiveServices(ctx)
	if err != nil {
		slog.Warn("Janitor: failed to list services", "error", err)
		return
	}

	for _, svc := range services {
		sessionID, ok := svc.Annotations["steel/sessionId"]
		if !ok || sessionID == "" {
			continue
		}

		exists, err := o.redis.SessionExists(ctx, sessionID)
		if err != nil {
			slog.Warn("Janitor: redis check failed", "error", err)
			continue
		}

		if !exists {
			svcName := svc.Name
			// Find the actual pod by sessionId label — warm pods retain their
			// browser-warm-{shortID} name rather than the canonical browser-session-{id}.
			pods, podErr := o.k8s.clientset.CoreV1().Pods(o.k8s.namespace).List(ctx, metav1.ListOptions{
				LabelSelector: fmt.Sprintf("sessionId=%s", sessionID),
			})
			if podErr == nil {
				for _, pod := range pods.Items {
					o.k8s.DeletePod(ctx, pod.Name)
				}
			}
			o.k8s.DeleteService(ctx, svcName)
			// Remove stale entry from session index.
			_ = o.redis.RemoveFromIndex(ctx, sessionID)
			slog.Info("Cleaned orphaned session", "sessionId", sessionID, "service", svcName)
		}
	}

	// Prune expired session IDs from the Redis index set.
	if removed, err := o.redis.CleanupStaleIndex(ctx); err != nil {
		slog.Warn("Janitor: failed to cleanup stale index", "error", err)
	} else if removed > 0 {
		slog.Info("Janitor: pruned stale index entries", "count", removed)
	}

	// Clean up stale prewarm pods that have been running > 30 minutes without being claimed.
	o.cleanupStalePrewarms(ctx)
}

func (o *Orchestrator) cleanupStalePrewarms(ctx context.Context) {
	o.warmMu.Lock()
	defer o.warmMu.Unlock()

	pods, err := o.k8s.clientset.CoreV1().Pods(o.k8s.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app=browser-session,role=prewarm",
	})
	if err != nil {
		return
	}
	for _, pod := range pods.Items {
		created := pod.CreationTimestamp.Time
		if time.Since(created) > 30*time.Minute {
			o.k8s.DeletePod(ctx, pod.Name)
			slog.Info("Cleaned stale prewarm pod", "podName", pod.Name, "age", time.Since(created).Round(time.Second))
		}
	}
}
