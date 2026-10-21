+++
title = "Compare"
description = "How Zentinel differs from nginx, HAProxy, Envoy, Caddy and Traefik — on design, not on benchmarks."
template = "page.html"
updated = 2026-10-18
+++

Zentinel is a reverse proxy built on Cloudflare's [Pingora](https://github.com/cloudflare/pingora) in Rust. The proxies below are mature, widely deployed, and each is the right choice for many workloads. This page compares **design choices**, not speed: we make no performance claims here, and the [benchmarks page](/benchmarks/) explains how our own measurements were made and where they fall short.

Facts about other projects are kept to their well-known, documented behaviour as of October 2026. If something here is wrong or out of date, please [open an issue](https://github.com/zentinelproxy/zentinelproxy.io/issues).

## At a glance

### Language and configuration

<div style="overflow-x: auto">

| | Language | Configuration | Reload |
|---|---|---|---|
| **Zentinel** | Rust | KDL file(s) | `SIGHUP`, or file watch with `auto-reload`; config validated before an atomic swap |
| **nginx** | C | `nginx.conf` | Graceful reload (`nginx -s reload`) |
| **HAProxy** | C | `haproxy.cfg` | Seamless reload (master-worker), runtime API |
| **Envoy** | C++ | YAML/JSON, or xDS APIs | Dynamic via xDS; hot restart |
| **Caddy** | Go | Caddyfile or JSON (admin API) | Graceful reload via admin API |
| **Traefik** | Go | Static file plus dynamic providers (files, Docker labels, Kubernetes CRDs) | Automatic from providers |

</div>

### Extensions and WAF

<div style="overflow-x: auto">

| | Extension model | WAF |
|---|---|---|
| **Zentinel** | External agents (separate processes over Unix sockets or gRPC); WebAssembly modules through the WASM agent | As agents: native Rust WAF, pure-Rust ModSecurity/CRS engine, or libmodsecurity |
| **nginx** | C modules, njs; Lua via OpenResty | Third-party ModSecurity connector; commercial F5 products |
| **HAProxy** | Lua; SPOE (external agents) | Commercial (HAProxy Enterprise), or via SPOE |
| **Envoy** | C++ filters, Lua, Wasm (proxy-wasm); `ext_authz`/`ext_proc` external services | Via Wasm or external filters (e.g. Coraza) |
| **Caddy** | Go modules compiled in (`xcaddy`) | Third-party modules (e.g. Coraza) |
| **Traefik** | Go plugins (Yaegi) and Wasm plugins | Plugins; commercial offerings |

</div>

### TLS and protocols

<div style="overflow-x: auto">

| | ACME (automatic certificates) | HTTP/3 (QUIC) |
|---|---|---|
| **Zentinel** | Built in: HTTP-01, DNS-01 (Cloudflare, Hetzner, webhook), EAB, ARI | **Not implemented** (an `h3` listener is rejected at startup) |
| **nginx** | External client traditionally; official ACME module since 2025 | Yes |
| **HAProxy** | External client traditionally; native ACME added in 3.2 | Yes |
| **Envoy** | Not built in (typically cert-manager / SDS) | Yes |
| **Caddy** | Built in, on by default | Yes, on by default |
| **Traefik** | Built in | Yes |

</div>

### Kubernetes, observability and license

<div style="overflow-x: auto">

| | Kubernetes Gateway API | Observability | License |
|---|---|---|---|
| **Zentinel** | `zentinel-gateway` controller (targets Gateway API v1.4.1; conformance work in progress) | Prometheus metrics, access logs; OpenTelemetry tracing behind the `opentelemetry` build feature | Apache-2.0 |
| **nginx** | Separate project (NGINX Gateway Fabric) | Logs, `stub_status`; exporters and OTel module | BSD-2-Clause |
| **HAProxy** | Separate controller projects | Built-in Prometheus exporter, stats, logs | GPL-2.0 |
| **Envoy** | Separate projects (e.g. Envoy Gateway) | Extensive stats, admin endpoint, tracing | Apache-2.0 |
| **Caddy** | No official controller | Prometheus metrics, logs | Apache-2.0 |
| **Traefik** | Built-in provider | Prometheus, OpenTelemetry | MIT |

</div>

## Where Zentinel is different

**Complexity lives outside the core.** Anything parsing-heavy or policy-rich — WAF inspection, authentication, custom business logic — runs in an [agent](https://docs.zentinelproxy.io/agents/), a separate process the proxy talks to over a Unix socket or gRPC, with its own timeout and an explicit `failure-mode` of `open` or `closed`. An agent can crash, restart or be upgraded without taking the proxy down. HAProxy's SPOE and Envoy's `ext_authz`/`ext_proc` follow a similar out-of-process idea; in Zentinel it is the primary extension model rather than one option among in-process alternatives. Agent SDKs exist for Rust, Go, Python, TypeScript, Elixir, Kotlin and Haskell.

**Explicit configuration, checked before it runs.** Limits and timeouts are written in the config rather than implied. `zentinel lint` reports settings that parse but are read by nothing, and a reload that fails validation leaves the running configuration in place. See the [manifesto](/manifesto/) for why.

**No vendor lock-in by design.** Zentinel is a single open-source project; WAF engines, ACME and the Gateway API controller are not reserved for a commercial edition. Releases are [signed and ship with SBOMs](/supply-chain/).

## Where another proxy is the better choice

- **You need HTTP/3 today.** Zentinel does not implement QUIC yet.
- **You are building a service mesh** or already run an xDS control plane: Envoy and the meshes built on it are designed for that.
- **You want the widest ecosystem, documentation and operational experience**: nginx and HAProxy have decades of production history and extensive module ecosystems.
- **You want zero-configuration HTTPS for a small site**: Caddy enables ACME and HTTP/3 by default with very little configuration.
- **Your routing is driven by Docker labels or Kubernetes annotations**: Traefik's provider model is built around exactly that.

## In more depth

The documentation has a longer, side-by-side comparison with configuration examples: [Comparison with alternatives](https://docs.zentinelproxy.io/concepts/comparison/). The [features page](/features/) lists what Zentinel does, and the [CHANGELOG](https://github.com/zentinelproxy/zentinel/blob/main/CHANGELOG.md) records what changed and when.
