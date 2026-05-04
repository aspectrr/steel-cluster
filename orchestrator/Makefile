.PHONY: build run test clean docker-build docker-push swag deploy undeploy e2e

# ─── Config ──────────────────────────────────────────────

BINARY     := bin/orchestrator
IMAGE      := ghcr.io/aspectrr/steel-orchestrator
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
	helm upgrade --install steel-cluster ../helm/steel-cluster \
	  --namespace $(NAMESPACE) --create-namespace \
	  --set orchestrator.image.pullPolicy=IfNotPresent \
	  --set web.image.pullPolicy=IfNotPresent
	kubectl rollout status deployment/browser-orchestrator -n $(NAMESPACE) --timeout=120s

undeploy:
	helm uninstall steel-cluster -n $(NAMESPACE) || true
	kubectl delete namespace $(NAMESPACE) --ignore-not-found

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
