# PATHMAP - Kubernetes Deployment Commands
# ========================================
# Quick reference for deploying to Kubernetes

# Prerequisites
# - kubectl configured
# - Kubernetes cluster running
# - Container images built and pushed to registry

# Create namespace
kubectl create namespace pathmap

# Apply secrets (update with real values first!)
kubectl apply -f k8s/secrets.yaml

# Deploy PostgreSQL
kubectl apply -f k8s/postgres.yaml

# Wait for PostgreSQL to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n pathmap --timeout=120s

# Deploy Redis
kubectl apply -f k8s/redis.yaml

# Wait for Redis to be ready
kubectl wait --for=condition=ready pod -l app=redis -n pathmap --timeout=60s

# Run database migrations (one-time job)
kubectl create job --from=cronjob/pathmap-migration pathmap-migration-initial -n pathmap

# Deploy application
kubectl apply -f k8s/deployment.yaml

# Wait for deployments
kubectl wait --for=condition=available deployment/pathmap-backend -n pathmap --timeout=180s
kubectl wait --for=condition=available deployment/pathmap-frontend -n pathmap --timeout=120s

# Check status
kubectl get pods -n pathmap
kubectl get services -n pathmap
kubectl get ingress -n pathmap

# View logs
kubectl logs -l app=pathmap,component=backend -n pathmap --tail=100 -f
kubectl logs -l app=pathmap,component=frontend -n pathmap --tail=100 -f

# Scale deployments
kubectl scale deployment pathmap-backend --replicas=5 -n pathmap

# Rolling update
kubectl set image deployment/pathmap-backend backend=ghcr.io/pathmap/backend:v2.0.0 -n pathmap
kubectl rollout status deployment/pathmap-backend -n pathmap

# Rollback
kubectl rollout undo deployment/pathmap-backend -n pathmap

# Port forward for local testing
kubectl port-forward service/pathmap-backend 8000:8000 -n pathmap
kubectl port-forward service/pathmap-frontend 3000:80 -n pathmap

# Execute command in pod
kubectl exec -it $(kubectl get pods -l app=pathmap,component=backend -n pathmap -o jsonpath='{.items[0].metadata.name}') -n pathmap -- /bin/sh

# View HPA status
kubectl get hpa -n pathmap

# Cleanup
kubectl delete namespace pathmap
