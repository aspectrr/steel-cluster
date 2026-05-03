.PHONY: build run test clean docker-build docker-push swag deploy undeploy e2e

# ─── Config ──────────────────────────────────────────────

BINARY     := bin/orchestrator
IMAGE      := browser-orchestrator
TAG        := latest
NAMESPACE  := browser-sessions
PORT       := 30300
GO         := go
SWAG       := $(shell which swag 2>/dev/null || echo go tool swag)

# ─── Build ───────────────────────────────────────────────

build: swag
	$(GO) build -o $(BINARY) .

run: build
	$(GO) run .

test:
	$(GO) test ./... -v

clean:
	rm -rf bin/ docs/

# ─── OpenAPI Spec ────────────────────────────────────────

swag:
	$(SWAG) init -g main.go -o ./docs --parseDependency --parseInternal 2>/dev/null

# ─── Docker ──────────────────────────────────────────────

docker-build: swag
	docker build -t $(IMAGE):$(TAG) .

docker-push:
	docker push $(IMAGE):$(TAG)

# ─── Kubernetes ──────────────────────────────────────────

deploy: docker-build
	kubectl apply -f ../kubernetes/namespace.yaml
	kubectl apply -f ../kubernetes/rbac/
	kubectl apply -f ../kubernetes/redis/
	kubectl apply -f ../kubernetes/orchestrator/
	kubectl rollout status deployment/browser-orchestrator -n $(NAMESPACE) --timeout=60s

undeploy:
	kubectl delete -f ../kubernetes/orchestrator/ --ignore-not-found
	kubectl delete -f ../kubernetes/redis/ --ignore-not-found
	kubectl delete -f ../kubernetes/rbac/ --ignore-not-found
	kubectl delete -f ../kubernetes/namespace.yaml --ignore-not-found

# ─── E2E Tests ──────────────────────────────────────────

e2e:
	docker build -t steel-e2e-tests:latest ../tests/
	kubectl delete job steel-e2e-tests -n $(NAMESPACE) --ignore-not-found
	sleep 2
	kubectl apply -f ../tests/job.yaml
	kubectl logs -f job/steel-e2e-tests -n $(NAMESPACE)

# ─── Dev (hot reload) ───────────────────────────────────

dev: swag
	K8S_NAMESPACE=$(NAMESPACE) \
	REDIS_HOST=localhost \
	REDIS_PORT=6379 \
	BROWSER_IMAGE=ghcr.io/steel-dev/steel-browser-api:latest \
	BROWSER_PORT=3000 \
	WARM_POOL_SIZE=0 \
	$(GO) run .

# ─── Help ────────────────────────────────────────────────

help:
	@echo "Steel Cluster Orchestrator"
	@echo ""
	@echo "  make build          Build binary to $(BINARY)"
	@echo "  make run            Build and run locally"
	@echo "  make test           Run Go tests"
	@echo "  make clean          Remove bin/ and docs/"
	@echo "  make swag           Regenerate OpenAPI spec"
	@echo "  make docker-build   Build Docker image"
	@echo "  make deploy         Build + deploy to K8s"
	@echo "  make undeploy       Remove all K8s resources"
	@echo "  make e2e            Run E2E tests on K8s"
	@echo "  make dev            Run locally (no K8s pod management)"
	@echo ""
