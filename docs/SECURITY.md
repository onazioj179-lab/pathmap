# PATHMAP V99 Security Hardening Guide

## Overview

This document details the security measures implemented in PATHMAP V99 to ensure production-grade security posture.

## Authentication & Authorization

### JWT Secret Management

- **Enforcement**: JWT_SECRET is required in production (app fails fast if missing)
- **Generation**: Use `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- **Storage**: Set as environment variable, never commit to repo
- **Rotation**: Implement key rotation with overlapping validity periods

### Token Security

- Tokens include `iss`, `aud`, `jti` claims for proper validation
- Short-lived access tokens (15 min) with refresh tokens
- Revocation list maintained for compromised tokens

## CORS Configuration

### Strict Origin Control

- No wildcard origins (`*`) allowed
- Explicit allow-list via `CORS_ORIGINS` environment variable
- Credentials enabled only with specific origins
- Methods restricted to: GET, POST, PUT, DELETE, OPTIONS, PATCH
- Headers limited to: Content-Type, Authorization, X-Request-ID, Accept

### Production Setup

```bash
export CORS_ORIGINS="https://yourdomain.com,https://api.yourdomain.com"
```

## Security Headers

### Content Security Policy (CSP)

Production CSP prevents XSS attacks:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
worker-src 'self' blob:;
connect-src 'self' [tile-servers];
frame-ancestors 'none';
```

### Additional Headers

- **HSTS**: `max-age=31536000; includeSubDomains; preload`
- **X-Frame-Options**: DENY
- **X-Content-Type-Options**: nosniff
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Permissions-Policy**: Restricts geolocation, bluetooth to self; blocks camera, mic, payment

## Cache Control

### Sensitive Endpoints

Auth and PII endpoints have `Cache-Control: no-store` to prevent caching:

- `/api/v1/auth/*`
- `/api/v1/social/auth/*`
- `/api/v1/tracking/*`
- `/api/v1/tunnel/*`

## Rate Limiting

### Tiered Limits

- **Standard**: 100 req/min per IP
- **Auth endpoints**: 10 req/min per IP
- **Burst allowance**: 10 requests
- **Backend**: Redis-based distributed limiting

## Dependency Security

### Pinned Versions

All dependencies pinned to exact versions in `requirements.txt`:

- Prevents supply chain attacks
- Ensures reproducible builds
- Facilitates security audits

### SBOM Generation

Software Bill of Materials generated via CycloneDX:

```bash
# Frontend
npm install -g @cyclonedx/cyclonedx-npm
cyclonedx-npm --output-file frontend-bom.xml

# Backend
pip install cyclonedx-bom
cyclonedx-py -o backend-bom.xml
```

## Container Security

### Non-Root User

- Backend runs as `pathmap:pathmap` (UID 1000)
- Frontend nginx configured for non-root
- No privilege escalation

### Resource Limits

```yaml
backend:
  limits: { cpus: "2.0", memory: 1G }
  reservations: { cpus: "1.0", memory: 512M }
postgres:
  limits: { cpus: "1.0", memory: 512M }
```

### Base Image Hygiene

- Use minimal Alpine-based images
- Pin digests for reproducibility
- Regular vulnerability scanning with Trivy

## Network Security

### TLS Termination

Configure at edge (nginx or load balancer):

```nginx
listen 443 ssl http2;
ssl_certificate /path/to/cert.pem;
ssl_certificate_key /path/to/key.pem;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
```

### X-Request-ID Propagation

Correlation IDs forwarded through all layers:

- Nginx sets `X-Request-ID: $request_id`
- Backend logs include request ID
- Sentry tags errors with request ID

## Observability

### Prometheus Metrics

Endpoint: `/metrics`
Metrics:

- Request rate, latency histograms
- In-progress requests
- Status code distribution

### Logging

- Structured JSON logs
- PII redaction in place
- Correlation via X-Request-ID

## Secrets Management

### Environment Variables

Never use defaults in production:

```bash
# Required
export JWT_SECRET="..."
export POSTGRES_PASSWORD="..."

# Recommended
export SENTRY_DSN="..."
export REDIS_PASSWORD="..."
```

### Kubernetes Secrets

Use SealedSecrets or external vault:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: pathmap-secrets
type: Opaque
data:
  JWT_SECRET: <base64>
  POSTGRES_PASSWORD: <base64>
```

## Deployment Checklist

### Pre-Production

- [ ] JWT_SECRET set (min 32 chars)
- [ ] POSTGRES_PASSWORD changed from default
- [ ] CORS_ORIGINS configured for production domains
- [ ] ENVIRONMENT=production
- [ ] TLS certificates installed
- [ ] Resource limits defined
- [ ] SBOM generated and archived

### Runtime

- [ ] HSTS header active
- [ ] CSP without unsafe-inline
- [ ] Rate limiting verified
- [ ] Metrics endpoint accessible
- [ ] Health checks responding
- [ ] Logs structured and forwarded

### Post-Deployment

- [ ] Vulnerability scan (Trivy/Snyk)
- [ ] Dependency update automation (Dependabot/Renovate)
- [ ] Penetration testing (auth flows)
- [ ] Load testing (rate limit thresholds)

## Incident Response

### Security Events

1. Review logs via `X-Request-ID`
2. Check Sentry for exceptions
3. Verify rate limit blocks in logs
4. Audit auth token usage

### Token Revocation

Add to revocation list in Redis:

```python
await redis.sadd("revoked_tokens", jti)
await redis.expire("revoked_tokens", token_ttl)
```

## Compliance Notes

### GDPR

- PII redacted from logs
- Data export available via `/api/v1/social/export`
- Right to deletion via `/api/v1/social/delete`

### Retention

- Location data: 90 days default
- Logs: 30 days
- Metrics: 15 days

## References

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- CWE Top 25: https://cwe.mitre.org/top25/
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework
