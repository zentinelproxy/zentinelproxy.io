+++
title = "NGINX Ingress Is Dead. Here's What to Do Next."
description = "NGINX Ingress Controller maintenance halted in March 2026, with no more releases or security patches. We built a Gateway API controller for Zentinel. Here's the migration story."
date = 2026-03-14
updated = 2026-03-15
[taxonomies]
tags = ["gateway-api", "kubernetes", "nginx", "migration", "ingress"]
+++

We've been watching the NGINX Ingress situation for a while. When Kubernetes [announced the retirement](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/) back in November, the writing was on the wall, but there was still time. That time is up. As of March 2026, NGINX Ingress Controller is no longer maintained. No releases, no bugfixes, no security patches. The repositories are moving to `kubernetes-retired/`.

If you're running NGINX Ingress in production today, your ingress layer is now unpatched software sitting at your network edge. That's not a comfortable place to be.

We spent the last few weeks building a Gateway API controller for Zentinel. This post is about why we built it, what we learned along the way, and how to actually migrate.

## What an ingress controller actually does

Before getting into the migration, it's worth stepping back and thinking about what an ingress controller is really doing for you, because the answer matters for choosing what comes next.

Your Kubernetes cluster runs pods. Those pods have internal IPs that change every time they restart. Services give them stable names, but those names only work inside the cluster. To get external traffic to your applications, something needs to sit at the boundary, accept incoming connections, terminate TLS, look at the request, figure out which service it belongs to, and proxy it there.

That's the ingress controller. It's a reverse proxy that's aware of your Kubernetes resources. It watches for Ingress (or now, Gateway API) objects, reads the routing rules you've declared, and configures itself to match. When you add a new hostname, change a path, or rotate a certificate, the controller picks up the change and reconfigures the proxy without dropping connections.

The reason this matters so much is that it's the one component that touches every single inbound request. It's your TLS termination point. It's where your rate limiting happens. It's where your WAF runs. If the ingress controller has a bug, a memory leak, or a security vulnerability, every application behind it is affected. It's arguably the most critical piece of infrastructure in a production cluster, and the one that needs the most attention to performance, safety, and correctness.

NGINX Ingress handled this by running NGINX (the C-based web server) inside a container, with a Go controller that watched Kubernetes resources and regenerated `nginx.conf` whenever something changed. It worked, but the architecture had a fundamental tension: NGINX is configured through text files, and Kubernetes resources are structured data. The controller had to translate one into the other, and the `snippet` annotations were the escape hatch for when the translation wasn't expressive enough. That escape hatch is what eventually brought the project down.

## How we got here

The story of NGINX Ingress is honestly kind of sad. For years it was *the* way to get traffic into a Kubernetes cluster. Millions of deployments. And for most of that time, one person was maintaining it. Nights and weekends, volunteer work, for a project that half the internet depends on.

The technical debt accumulated in ways that are obvious in hindsight. The `server-snippet` and `configuration-snippet` annotations were the big one. They let anyone with Ingress create permissions inject raw NGINX config into the proxy. It was incredibly flexible. It was also CVE-2021-25742 and every variant that followed. The same feature that made NGINX Ingress the "just add an annotation" solution is what made it a security liability.

When the maintainers tried to find help or build a successor (InGate), it didn't gain traction. And so here we are.

## The Gateway API, briefly

The Kubernetes project's answer is the [Gateway API](https://gateway-api.sigs.k8s.io/), a set of CRDs that replace the Ingress resource. The core idea is separating concerns:

- **GatewayClass**, which says who provides the implementation (think `StorageClass` for networking)
- **Gateway**, which defines the infrastructure: ports, protocols, TLS
- **HTTPRoute, GRPCRoute, TLSRoute**, which define the actual routing rules

Platform teams own Gateways. Application teams own Routes. Nobody injects raw config into anyone else's namespace. It's a cleaner model, and it's where Kubernetes networking is heading.

The Gateway API is also more expressive than the old Ingress resource. You can match on headers, query parameters, and methods, not just paths. You can split traffic between backends by weight. You can modify request and response headers. You can do cross-namespace routing with explicit permission grants. Most of the things that required vendor-specific annotations on NGINX Ingress are first-class fields in the Gateway API.

## Why we built this, and why Pingora matters

We're not going to pretend Zentinel is the only option. Envoy Gateway, Contour, and Traefik all have Gateway API implementations. They're solid projects.

But we had a specific itch to scratch, and it starts with the proxy itself.

Zentinel is built on [Pingora](https://github.com/cloudflare/pingora), Cloudflare's Rust-based proxy framework. Cloudflare built Pingora because they hit the limits of NGINX at scale, processing trillions of requests, and needed something with better memory safety, lower tail latency, and more control over connection handling. They open-sourced it in 2024, and we've been building on it ever since.

This matters for the ingress controller story because the proxy layer is where the performance lives. Every request that enters your cluster passes through this code. Pingora gives us an async, multi-threaded Rust runtime with zero-copy I/O, connection pooling per upstream, and HTTP/2 multiplexing out of the box. Because it's Rust, there are no garbage collection pauses, no null pointer exceptions in the request path, no data races. The compiler enforces these things at build time, not at 3am when your pager goes off.

We've [benchmarked Zentinel against NGINX, Envoy, HAProxy, and Caddy](/benchmarks/). The numbers speak for themselves, but the short version is that Zentinel consistently shows the lowest p99 latency and highest throughput in our test suite. Our pure-Rust WAF agent processes 912,000 requests per second on the same hardware where ModSecurity manages around 30,000. These aren't theoretical numbers; they come from our [open-source benchmark suite](https://github.com/zentinelproxy/zentinel-bench) that anyone can reproduce.

But performance wasn't actually the main reason we built this controller. The main reason was architectural.

Zentinel was designed around a principle that happens to be exactly what killed NGINX Ingress: custom logic should never run inside the proxy process. In Zentinel, if you need a WAF, auth, rate limiting, or any custom behavior, it runs in an external [agent](/docs/agents/), a separate process that talks to the proxy over Unix domain sockets or gRPC. If the agent crashes, it restarts. The proxy keeps serving traffic. You can write agents in Rust, Go, Python, TypeScript, Elixir, or any language that can speak our protocol. We have [SDKs for over a dozen languages](https://github.com/zentinelproxy).

This is the opposite of the snippets model. There's no annotation that lets you inject arbitrary configuration into the proxy. Not because we removed it after a CVE, but because the architecture never had a place for it. The proxy's config is declarative and validated at load time. Complex logic lives in agents, which are crash-isolated by OS process boundaries. The blast radius of a bad agent is that one agent restarts; the proxy and every other agent keep running.

When you combine this with the Pingora foundation, what you get is an ingress controller where the data plane is written in safe, compiled code, the custom logic is crash-isolated, and the configuration can't be injected from YAML annotations. That's a meaningfully different posture from NGINX Ingress, and it's the reason we thought it was worth building a controller rather than just pointing people at the alternatives.

## What the controller does

We built [zentinel-gateway](https://github.com/zentinelproxy/zentinel/pull/141), a Kubernetes controller that watches Gateway API resources and translates them into Zentinel's internal config. The controller is itself written in Rust, using the [kube-rs](https://kube.rs) client library, and runs as a separate binary from the proxy.

Here's what it handles:

| Resource | What it does |
|----------|-------------|
| GatewayClass | Claims `zentinelproxy.io/gateway-controller`, sets status conditions |
| Gateway | Translates listeners, resolves TLS certificates from K8s Secrets, validates PEM content |
| HTTPRoute | Path, header, method, query param matching. RequestRedirect, URLRewrite, and header modification filters. Weighted traffic splitting. Backend existence and cross-namespace validation. |
| GRPCRoute | Service/method matching, forces HTTP/2, gRPC health checks |
| TLSRoute | SNI-based passthrough routing |
| TCPRoute | Raw TCP proxying |
| ReferenceGrant | Cross-namespace reference validation |
| BackendTLSPolicy | Upstream mTLS configuration |
| Ingress (compat) | Legacy Ingress resources with `ingressClassName: zentinel` |

The translation layer is where the interesting work happens. When you create an HTTPRoute, the controller reads the matches, filters, and backend refs, then builds the equivalent Zentinel `RouteConfig` and `UpstreamConfig` objects. It resolves Kubernetes service names to DNS entries (`my-service.my-namespace.svc.cluster.local`), sets up health checks appropriate to the protocol (HTTP for web backends, gRPC health protocol for gRPC services, plain TCP for TLS passthrough), and assigns weights for traffic splitting. The translated config is pushed into the proxy through an atomic swap, so there's no moment where the proxy is running with a half-applied configuration.

For TLS, the controller watches `kubernetes.io/tls` Secrets referenced by Gateway listeners. When it finds one, it extracts the certificate and private key, writes them to disk with 0600 permissions, and configures the listener to use them. If the Secret changes (say, cert-manager renews a certificate), the controller picks up the change and refreshes the files automatically. We also support multiple certificates per listener for SNI-based certificate selection.

On the operational side, the controller supports Lease-based leader election for running multiple replicas safely, and exposes Prometheus metrics for monitoring reconciliation latency, error rates, and the number of active resources.

We also built three custom policy CRDs that attach Zentinel-specific features to Gateway API resources through the [policy attachment model](https://gateway-api.sigs.k8s.io/reference/policy-attachment/):

- **ZentinelRateLimitPolicy** attaches rate limiting to an HTTPRoute or Gateway, with configurable keys (client IP, header, global), burst, and custom status codes
- **ZentinelWAFPolicy** attaches WAF inspection to a route, with detect or block mode, ruleset selection, and per-rule exclusions
- **ZentinelAgentBinding** attaches any Zentinel agent to a route, with failure mode, timeout, and phase configuration

These are `v1alpha1` CRDs under the `policy.zentinelproxy.io` group. They're optional, the controller works fine without them, but they're how you get Zentinel's agent-based features into a Gateway API workflow without inventing custom annotations.

## Migrating, step by step

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

This creates a `GatewayClass` named `zentinel` and starts the controller. The Helm chart sets up the RBAC rules the controller needs: read access to Gateway API resources, Secrets, Services, and Endpoints, plus write access to status subresources and Leases (for leader election).

### 3. Create a Gateway

This is the equivalent of deploying the NGINX Ingress controller itself. A Gateway declares what ports to listen on, what protocols to speak, and where to find TLS certificates:

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
          - name: wildcard-tls  # your existing TLS Secret works here
```

The controller picks this up, validates that the GatewayClass belongs to us, resolves the TLS Secret, and configures the proxy's listeners. You'll see `Accepted` and `Programmed` conditions on the Gateway's status within a few seconds.

### 4. Convert your Ingress resources to HTTPRoutes

A typical NGINX Ingress resource:
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

The routing intent is the same, just expressed as proper API fields instead of annotations. Notice that the `parentRefs` field explicitly says which Gateway this route attaches to. In NGINX Ingress, the binding between Ingress and controller was implicit (through the class name). In the Gateway API, it's explicit, and the Gateway can control which namespaces are allowed to attach routes to it.

### 5. Or don't convert yet

Here's something we thought was important: you shouldn't have to rewrite all your Ingress manifests on day one. The controller includes an Ingress compatibility shim. Set `ingressClassName: zentinel` on your existing Ingress resources and Zentinel will handle them alongside Gateway API resources. The shim translates each Ingress rule into the equivalent internal route configuration, so your existing host/path/backend mappings keep working.

This means you can migrate incrementally. Start with the Gateway and one HTTPRoute. Verify it works. Then move the next service over. The old Ingress resources and the new HTTPRoutes coexist in the same controller, routing to the same backends.

## The annotation mapping

If you've been running NGINX Ingress for a while, you probably have annotations everywhere. We put together a [mapping guide](https://github.com/zentinelproxy/zentinel/blob/main/crates/gateway/docs/migration-from-nginx-ingress.md) that covers the common ones:

- **Path types and host matching** map directly to HTTPRoute matches
- **TLS certificates** move from `spec.tls[].secretName` to Gateway listener `certificateRefs`
- **Header manipulation** (`proxy-set-headers`) becomes `RequestHeaderModifier` filters
- **Canary deployments** (`canary-weight` annotation) become weighted `backendRefs`, which is honestly a nicer API
- **Cross-namespace routing** (`ExternalName` services) becomes `ReferenceGrant`, which is more explicit about what's allowed
- **Custom logic** (`server-snippet`, Lua) becomes Zentinel agents, which is a bigger change but a safer one

The guide has before/after YAML for each pattern.

The one area where there isn't a clean 1:1 mapping is the snippet annotations. If you were using `server-snippet` to add custom NGINX directives, there's no Gateway API equivalent because the whole point of the Gateway API is to not have that escape hatch. In Zentinel, the answer is agents. If you need to add custom headers based on request content, validate JWTs, call an external authorization service, or run any kind of request-time logic, you write a small agent that implements the behavior you need. It's more work than pasting a snippet into an annotation, but it's also the kind of work that doesn't produce CVEs.

## Conformance status

We've been running the official Gateway API conformance test suite against the controller. As of the latest run, the Gateway HTTP conformance profile breaks down like this:

- All **Gateway-level tests pass**: GatewayClass acceptance, listener status conditions, TLS certificate validation (including malformed secrets and missing ReferenceGrants), attached route counting, listener modification
- All **HTTPRoute status condition tests pass**: backend validation (unknown kinds, nonexistent services, cross-namespace permission), parent ref validation (sectionName matching, cross-namespace rejection, hostname intersection), generation tracking
- **HTTPRoute traffic routing tests** are still in progress. The controller correctly translates routes and writes config, but the proxy-side integration for actually forwarding requests to the conformance test backends needs more work

We've [submitted our conformance report](https://github.com/kubernetes-sigs/gateway-api/pull/4687) to the upstream Gateway API project. It's honest about what passes and what doesn't. We'll keep updating it as the traffic routing tests come online.

## What's still ahead

The controller covers the full Gateway API surface area: GatewayClass, Gateway, HTTPRoute, GRPCRoute, TLSRoute, TCPRoute, ReferenceGrant, BackendTLSPolicy, and the Ingress compatibility shim. RequestRedirect and URLRewrite filters are translated. Custom policy CRDs are defined.

The remaining work is on the proxy side: making the Zentinel proxy correctly read and act on the config that the controller generates, so that HTTP requests actually reach the backends. This is config-writer-to-KDL-parser alignment work, not missing features in the controller itself.

## Trying it out

The Helm chart deploys both the controller and a Zentinel proxy sidecar in a two-container pod. The controller watches Gateway API resources and writes translated config to a shared volume. The proxy reads it with auto-reload enabled.

```bash
helm install zentinel-gateway oci://ghcr.io/zentinelproxy/charts/zentinel-gateway \
  --namespace zentinel-system --create-namespace
```

The chart sets up RBAC for all Gateway API resources, creates the `zentinel` GatewayClass, exposes Prometheus metrics, and runs a LoadBalancer Service for proxy traffic on ports 80 and 443. If you're running in a test environment without a load balancer (like kind), you can use NodePort instead:

```bash
helm install zentinel-gateway oci://ghcr.io/zentinelproxy/charts/zentinel-gateway \
  --namespace zentinel-system --create-namespace \
  --set proxy.serviceType=NodePort \
  --set proxy.httpNodePort=30080
```

If you hit issues, the [migration guide](https://github.com/zentinelproxy/zentinel/blob/main/crates/gateway/docs/migration-from-nginx-ingress.md) has more detail. The [conformance test script](https://github.com/zentinelproxy/zentinel/blob/main/scripts/conformance-test.sh) shows exactly how to set up a kind cluster and run the full suite. And the controller source is about 10,000 lines of Rust across the reconcilers, translator, policy CRDs, config writer, leader election, metrics, and TLS handling. It's not a small project, but the code is straightforward. Most of the complexity is in correctly mapping Gateway API semantics to Zentinel's config model, and in handling the edge cases around cross-namespace references, status conditions, and certificate rotation.

We'd genuinely appreciate feedback, especially from people migrating real NGINX Ingress setups. What annotations are you using that we haven't mapped? What broke? What did we get wrong? Open an [issue](https://github.com/zentinelproxy/zentinel/issues) and tell us.
