+++
title = "Zentinel Upgrades to Pingora 0.8: Keepalive Limits, Stricter HTTP Framing, and a Leaner Builder API"
description = "Pingora 0.8.0 brings connection reuse limits, stricter HTTP/1 validation, upload write-pending diagnostics, and a new builder pattern for proxy services. Here's what changed in Zentinel and what operators should know."
date = 2026-03-05
[taxonomies]
tags = ["infrastructure", "pingora", "security", "rust"]
+++

On March 2, Cloudflare released [Pingora 0.8.0](https://github.com/cloudflare/pingora/releases/tag/0.8.0). Two days later, Zentinel runs on it. This post covers every change in the release, what we adapted, what we gained, and — honestly — what's mostly plumbing.

If the [0.7 upgrade](/blog/pingora-0-7-upgrade/) was about dropping our fork and gaining connection-level filtering, this one is about operational control: capping connection reuse, diagnosing upload latency, and inheriting a wave of HTTP correctness fixes from Cloudflare's production traffic.

## The fork lives on (for now)

Last time we upgraded Pingora, we celebrated dropping our fork. That didn't last.

Between 0.7 and 0.8, a [vulnerability in the `prometheus` crate](https://rustsec.org/advisories/RUSTSEC-2026-0009.html) landed in the advisory database. Pingora depends on it transitively. Upstream hadn't patched yet, so we [cherry-picked a fix](https://github.com/raskell-io/pingora/tree/zentinel-0.8.0) onto the 0.8.0 tag — a single commit bumping the `prometheus` dependency to a safe version.

The fork is minimal: one patch, one crate, one commit delta from upstream. The moment Cloudflare releases 0.8.1 or 0.9.0 with the fix included, we drop it again. We check upstream weekly.

```toml
# Cargo.toml — single-commit fork of 0.8.0
pingora = { version = "0.8.0", git = "https://github.com/raskell-io/pingora.git", rev = "5c23fe7" }
```

## What's new in Pingora 0.8

### Connection reuse limits (`keepalive_request_limit`)

This is the headline feature for operators. Pingora 0.8 adds a `keepalive_request_limit` field to `HttpServerOptions` — a cap on how many requests a single downstream connection can serve before the proxy closes it.

This is equivalent to nginx's [`keepalive_requests`](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#keepalive_requests) directive, and it exists for the same reason nginx documents:

> Closing connections periodically is necessary to free per-connection memory allocations. Therefore, using too high maximum number of requests could result in excessive memory usage and not recommended.

Long-lived HTTP/1.1 keep-alive connections and HTTP/2 streams accumulate per-connection state: TLS session data, header compression tables (HPACK), internal buffers. In deployments with thousands of persistent connections — load balancers, service meshes, gRPC — this memory adds up. Periodically recycling connections bounds the growth.

Zentinel exposes this through a new `keepalive-max-requests` option on listeners:

```kdl
listeners {
    listener "default-http" {
        address "0.0.0.0:8080"
        protocol "http"
        keepalive-max-requests 1000
    }
}
```

When multiple listeners are configured, Zentinel uses the most restrictive (lowest) value across all listeners for the Pingora-level setting:

```rust
let keepalive_request_limit = config
    .listeners
    .iter()
    .filter_map(|l| l.keepalive_max_requests)
    .min();
```

If unset, the default is no limit — matching both Pingora's and Zentinel's previous behavior. Existing configurations are unaffected.

**When to use this:** If you see per-connection memory growing over time in long-running deployments, or if you're behind a load balancer that holds persistent connections for hours. A value of 1000–10000 is reasonable for most deployments. If you're not seeing memory pressure from connection state, leave it unset.

### Upload diagnostics (`upstream_write_pending_time`)

Pingora 0.8 adds `upstream_write_pending_time()` to `Session` — a measurement of how long the proxy waited to write the request body to the upstream backend. This matters for upload-heavy workloads (file uploads, API payloads, streaming ingestion) where the bottleneck is often the upstream's ability to accept data, not the network round trip.

We've added this to Zentinel's request completion log:

```rust
let write_pending_ms = session.upstream_write_pending_time().as_millis() as u64;
debug!(
    trace_id = %ctx.trace_id,
    route_id = ?ctx.route_id,
    upstream = ?ctx.upstream,
    status = status,
    duration_ms = duration.as_millis() as u64,
    upstream_write_pending_ms = write_pending_ms,
    "Request completed"
);
```

This appears in debug-level structured logs as `upstream_write_pending_ms`. If you're investigating slow uploads, enable debug logging for a specific route and look for high values here — they indicate the upstream is slow to read the request body, which is distinct from upstream response latency (the time waiting for the response *after* the request is fully sent).

We've also added a Prometheus histogram (`zentinel_upstream_write_pending_seconds`) with buckets from 1ms to 10s, ready for when we wire it into the metrics pipeline in a follow-up release.

### ProxyServiceBuilder

Pingora 0.8 introduces a builder pattern for constructing proxy services, replacing the previous `http_proxy_service()` free function:

```rust
// Before (Pingora 0.7)
let mut proxy_service = http_proxy_service(&server.configuration, proxy);

// After (Pingora 0.8)
let mut proxy_service = ProxyServiceBuilder::new(&server.configuration, proxy)
    .name("Zentinel Proxy")
    .server_options(server_options)
    .build();
```

The builder is how you now pass `HttpServerOptions` — including the keepalive request limit and CONNECT method policy. It's also where the service gets its name, which appears in logs and metrics.

One wrinkle: `HttpServerOptions` is now marked `#[non_exhaustive]`, meaning you can't construct it with a struct literal. You must use `Default::default()` and mutate fields:

```rust
let mut server_options = HttpServerOptions::default();
server_options.keepalive_request_limit = Some(1000);
```

This is good API design — Cloudflare can add fields in future releases without breaking downstream code. But it means if you're building on Pingora directly, your existing struct construction will fail on upgrade.

### CONNECT method disabled by default

Pingora 0.8 disables HTTP CONNECT method proxying by default. Previously, CONNECT requests were passed through unless explicitly blocked. Now they're rejected with `405 Method Not Allowed` unless you opt in via `HttpServerOptions::allow_connect_method_proxying`.

Zentinel already rejected CONNECT requests in its routing layer — we don't support forward proxy semantics. But having the framework enforce this at a lower level is defense in depth. If a routing bug or configuration error accidentally matched a CONNECT request, Pingora now stops it before it reaches our code.

We leave `allow_connect_method_proxying` at its default `false`. No action needed from operators.

### Pipe subrequests

Pingora 0.8 adds a "pipe subrequests" utility — a state machine that lets you treat a subrequest as a pipe, sending request bodies and receiving response bodies as streaming tasks. This builds on the background subrequest support added in 0.7, making it more practical for chained requests where the output of one subrequest feeds into the next.

For Zentinel, this is relevant to our shadow traffic feature (sending request copies to a secondary backend for testing) and potential future work on request transformation chains. We haven't integrated it yet, but the primitive is available.

### Service-level dependencies

A new system for declaring dependencies between Pingora services. This lets services express startup ordering — "don't start accepting traffic until the health check service is ready" — and shutdown ordering. Useful for complex multi-service configurations, but not something Zentinel needs today given our single-proxy-service architecture.

## HTTP correctness fixes

The bulk of Pingora 0.8 is HTTP correctness work. These aren't features you configure — they're the framework doing the right thing where it previously didn't. All of these take effect automatically when running on Pingora 0.8.

### Stricter HTTP/1 framing

Three related fixes tighten HTTP/1.1 message framing:

**Invalid Content-Length rejection.** Requests with malformed `Content-Length` headers (non-numeric, negative, multiple conflicting values) are now rejected outright. Previously, some of these could pass through with ambiguous body framing — a classic vector for [request smuggling](https://portswigger.net/web-security/request-smuggling). Pingora now validates Content-Length on both requests and responses.

**Transfer-Encoding vs Content-Length.** When a response has both `Transfer-Encoding` and `Content-Length`, Pingora now strips `Content-Length` per [RFC 9110 §8.6](https://www.rfc-editor.org/rfc/rfc9110#section-8.6). This eliminates another ambiguity that smuggling attacks exploit.

**HTTP/1.0 close-delimited mode.** A fix prevents incorrectly entering close-delimited body mode for HTTP/1.0 requests, which could cause the proxy to hang waiting for a body that would never arrive.

For Zentinel operators, this means the proxy is more correct at the HTTP layer without any configuration changes. Malformed requests that previously might have been forwarded to backends are now rejected at the proxy.

### WebSocket upgrade handling

The `UpgradedBody` type — used after a `101 Switching Protocols` response for WebSocket connections — is now an explicit `HttpTask` variant. Additionally, close-delimited body mode is correctly entered *after* the 101 is received, not before.

Zentinel's WebSocket frame inspection (where agents can inspect individual WebSocket frames for security purposes) benefits from this — the byte stream handoff between HTTP and WebSocket framing is now more reliable.

### Range request validation

Empty range sets (`bytes=` with no actual ranges) now correctly return `416 Range Not Satisfiable` per [RFC 9110 §14.1.2](https://www.rfc-editor.org/rfc/rfc9110#section-14.1.2), instead of being treated as valid. The `{Content, Transfer}-Encoding` headers are also stripped from 416 responses, mirroring the existing behavior for 304 responses.

### H2 read timeout handling

When an HTTP/2 upstream request times out, Pingora now sends `RST_STREAM` with `CANCEL` instead of closing the entire connection. This means a single slow upstream request no longer kills all multiplexed streams on that connection — only the timed-out stream is cancelled.

### Ketama hashing fix

A bug in the [ketama](https://en.wikipedia.org/wiki/Consistent_hashing) consistent hashing load balancer caused configuration changes (adding/removing backends) to not persist correctly after updates. This is fixed. If you use consistent hashing for session affinity or cache sharding, backend changes now take effect reliably.

### Downstream session reuse guard

A safety fix ensures HTTP/1.1 downstream sessions aren't reused when more body bytes arrive than the `Content-Length` header promised. This prevents connection state corruption when a client sends a malformed request followed by a valid one on the same keep-alive connection.

## Breaking changes we adapted

Three API changes required code modifications in Zentinel:

### 1. `CacheKey::default()` removed

Pingora removed the `CacheKey::default()` convenience constructor. The intent is to push caching users toward implementing `cache_key_callback` themselves rather than relying on a default that may not suit their caching semantics.

Zentinel already implements `cache_key_callback`. The only use of `default()` was as a fallback, which we replaced with an equivalent explicit constructor:

```rust
// Before (Pingora 0.7)
Ok(CacheKey::default(req_header))

// After (Pingora 0.8)
Ok(CacheKey::new("", format!("{}", req_header.uri), ""))
```

Same behavior, explicit construction.

### 2. `http_proxy_service()` → `ProxyServiceBuilder`

Covered above. The free function is replaced with a builder pattern. Our construction code went from one line to five, but gained the ability to set `HttpServerOptions` — a net improvement.

### 3. `HttpServerOptions` is `#[non_exhaustive]`

Can't construct with a struct literal anymore. Use `Default::default()` and mutate. This is the right call from Cloudflare — it means future `HttpServerOptions` fields won't break downstream consumers.

None of these changes affect Zentinel's configuration format or runtime behavior. They're compile-time adaptations.

## What we didn't use (yet)

Transparency about what we *didn't* integrate from this release:

- **Client certificate verification in mTLS.** Pingora 0.8 adds support for client cert verification in its mTLS configuration. Zentinel already implements mTLS client verification using rustls's `WebPkiClientVerifier` directly — we configure it at the TLS layer before Pingora sees the connection. The Pingora-native API may be cleaner for new integrations, but switching would be churn with no behavioral change.

- **Pipe subrequests.** Useful primitive, no current use case that justifies integration today. Shadow traffic works fine with the existing fire-and-forget approach.

- **Service dependencies.** Single-service architecture means no dependencies to declare.

- **`upstream_write_pending_time` as a Prometheus metric.** The histogram helper is written and ready (`zentinel_upstream_write_pending_seconds`), but not yet wired into the request pipeline. Currently only available in debug logs. Coming in a follow-up release.

## What this means for Zentinel operators

**Nothing breaks.** Existing configurations work without changes. The upgrade is backwards-compatible.

**What you get:**

- **Connection reuse control** — New `keepalive-max-requests` listener option to bound per-connection memory growth. Useful for long-running deployments with persistent connections.
- **Stricter HTTP validation** — Malformed Content-Length, ambiguous Transfer-Encoding, and invalid range requests are now rejected at the proxy layer. This is defense in depth against request smuggling — your backends see cleaner traffic.
- **Better HTTP/2 timeout isolation** — A slow upstream on one stream no longer kills sibling streams on the same connection. Multiplexing works as intended.
- **More reliable WebSocket upgrades** — The HTTP-to-WebSocket handoff is more correct, benefiting frame-level agent inspection.
- **Upload latency visibility** — `upstream_write_pending_ms` in debug logs helps diagnose slow uploads and upstream backpressure.
- **Consistent hashing reliability** — Backend changes to ketama-hashed upstreams now persist correctly.

**Minimum Rust version:** Pingora 0.8 requires Rust 1.83+. Zentinel requires 1.92+. No change.

---

Zentinel [26.03_2](https://github.com/zentinelproxy/zentinel/releases/tag/26.03_2) (cargo v0.6.1) ships with Pingora 0.8 and all adaptations described above. Grab it:

```bash
# From source
cargo install zentinel-proxy

# Container
docker pull ghcr.io/zentinelproxy/zentinel:26.03_2

# Binary
curl -fsSL https://get.zentinelproxy.io | sh
```

<div class="blog-cta">
    <div class="blog-cta__title">Learn More About Zentinel</div>
    <div class="blog-cta__actions">
        <a href="/features/" class="btn btn-gradient">Features</a>
        <a href="/benchmarks/" class="btn btn-secondary">Benchmarks</a>
        <a href="https://registry.zentinelproxy.io" class="btn btn-secondary" target="_blank" rel="noopener">Agent Registry</a>
    </div>
</div>
