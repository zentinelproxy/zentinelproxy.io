+++
title = "NGINX Ingress Is Dead. Here's What to Do Next."
description = "NGINX Ingress Controller maintenance halted in March 2026 — no more releases, no more security patches. Zentinel's new Gateway API controller gives you a migration path that's faster, safer, and built for the way Kubernetes networking is heading."
date = 2026-03-14
[taxonomies]
tags = ["gateway-api", "kubernetes", "nginx", "migration", "ingress"]
+++

NGINX Ingress Controller is officially unmaintained. As of March 2026, there are [no more releases, no bugfixes, and no security patches](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/). The repositories are moving to `kubernetes-retired/` and going read-only.

If you're running NGINX Ingress in production, you're now running unpatched infrastructure at your network edge. Every CVE from here on out is your problem.

This isn't a drill. Here's what happened, why it matters, and how to migrate.

## Why NGINX Ingress died

The post-mortem is straightforward:

1. **One maintainer.** The project that handles ingress for a significant chunk of the internet was maintained by one person doing volunteer work on nights and weekends.
2. **Snippets were a security disaster.** The `server-snippet` and `configuration-snippet` annotations let anyone with Ingress create permissions inject arbitrary NGINX configuration into the proxy. This is how CVE-2021-25742 and its cousins happened. The feature that made NGINX Ingress flexible is the same feature that made it dangerous.
3. **No path forward.** Efforts to find new maintainers or build a replacement (InGate) never gained traction.

The Kubernetes project's recommendation is clear: **migrate to the Gateway API.**

## What is the Gateway API?

The [Gateway API](https://gateway-api.sigs.k8s.io/) is the official successor to the Ingress resource. It's a set of CRDs that separate infrastructure concerns from application routing:

- **GatewayClass** — who provides the implementation (like `StorageClass` for volumes)
- **Gateway** — the infrastructure: ports, TLS, network attachment
- **HTTPRoute / GRPCRoute / TLSRoute** — the application routing rules

This separation means platform teams manage Gateways and application teams manage Routes — without either stepping on the other's toes. No more annotation soup. No more config snippets.

## Why Zentinel?

We built a [Gateway API controller for Zentinel](https://github.com/zentinelproxy/zentinel/pull/141) because the NGINX Ingress retirement creates a vacuum, and the alternatives have trade-offs:

| | Zentinel | Envoy Gateway | Contour | Traefik |
|---|---|---|---|---|
| **WAF** | Built-in, 912K req/s | None | None | Plugin |
| **p99 latency** | Lowest in benchmarks | Higher | Higher | Higher |
| **Custom logic** | Crash-isolated agents (any language) | Lua/Wasm | None | Plugin |
| **Config injection risk** | Impossible by design | Low | Low | Low |
| **AI/LLM gateway** | Token-based rate limiting, model routing | No | No | No |

But the real differentiator is architectural: **Zentinel was designed to make NGINX Ingress's failure mode impossible.**

NGINX Ingress died because snippets let users inject arbitrary configuration. Zentinel doesn't have snippets. Custom logic runs in external [agents](/docs/agents/) — separate processes that communicate over UDS or gRPC. If an agent crashes, it restarts. The proxy keeps running. The blast radius of complexity is contained by process boundaries, not YAML annotations.

## Migrating in 5 minutes

### 1. Install the Gateway API CRDs

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.1/standard-install.yaml
```

### 2. Install the Zentinel Gateway controller

```bash
helm install zentinel-gateway oci://ghcr.io/zentinelproxy/charts/zentinel-gateway \
  --namespace zentinel-system \
  --create-namespace
```

This creates a `GatewayClass` named `zentinel` and starts watching for Gateway API resources.

### 3. Create a Gateway

Replace your NGINX Ingress controller deployment with a Gateway:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: main
spec:
  gatewayClassName: zentinel
  listeners:
    - name: http
      port: 80
      protocol: HTTP
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        certificateRefs:
          - name: wildcard-tls  # Your existing TLS Secret works as-is
```

### 4. Convert Ingress resources to HTTPRoutes

Your Ingress:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 8080
```

Becomes:
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-app
spec:
  parentRefs:
    - name: main
  hostnames:
    - app.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-service
          port: 8080
```

No annotations. No snippets. The routing intent is expressed directly in the API.

### 5. Run both side by side

You don't have to migrate everything at once. Zentinel's controller includes an **Ingress compatibility shim** — set `ingressClassName: zentinel` on your existing Ingress resources and Zentinel will handle them alongside Gateway API resources. Migrate at your own pace.

## What about my NGINX annotations?

We published a [complete annotation mapping guide](https://github.com/zentinelproxy/zentinel/blob/main/crates/gateway/docs/migration-from-nginx-ingress.md) that covers:

- **Routing** — path types, host matching, method matching
- **TLS** — certificate references, SSL redirect
- **Headers** — `proxy-set-headers` → `RequestHeaderModifier` filter
- **Rate limiting** — annotation → Zentinel rate limit config
- **Canary deployments** — `canary-weight` → Gateway API `backendRefs` weights
- **Cross-namespace** — `ExternalName` → `ReferenceGrant`
- **Custom logic** — `server-snippet` → Zentinel agents (the safe way)

## What the controller supports today

The initial release covers the core Gateway API conformance profile plus extras:

| Resource | Support |
|----------|---------|
| GatewayClass | Full |
| Gateway | Full (listeners, TLS from Secrets, status conditions) |
| HTTPRoute | Full (path/header/method/query matching, header modification, traffic splitting) |
| GRPCRoute | Full (service/method matching, HTTP/2, gRPC health checks) |
| TLSRoute | Full (SNI passthrough) |
| ReferenceGrant | Full (cross-namespace validation) |
| Ingress (compat) | Full (`ingressClassName: zentinel`) |

Operational features:
- **Leader election** — Lease-based HA for multi-replica deployments
- **Prometheus metrics** — reconciliation performance, resource counts, config rebuild stats
- **Helm chart** — one-command install with RBAC, security hardening, auto-created GatewayClass

## The bottom line

NGINX Ingress served the Kubernetes community well for years, but its time has passed. The Gateway API is the future of Kubernetes networking, and Zentinel is the implementation that takes the lessons of NGINX Ingress's failure seriously.

No config injection. No single maintainer. No snippets. Just a fast, safe, observable proxy that lets you sleep at night.

```bash
helm install zentinel-gateway oci://ghcr.io/zentinelproxy/charts/zentinel-gateway \
  --namespace zentinel-system --create-namespace
```

[Read the full migration guide →](https://github.com/zentinelproxy/zentinel/blob/main/crates/gateway/docs/migration-from-nginx-ingress.md)

[See the PR →](https://github.com/zentinelproxy/zentinel/pull/141)
