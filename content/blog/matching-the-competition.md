+++
title = "Benchmarking Sentinel Against the Established Proxies"
description = "We put Sentinel head-to-head with Envoy, HAProxy, nginx, and Caddy — then used the results to find and fix the per-request allocations that were costing us CPU. Three rounds of optimization later, Sentinel matches or beats every proxy we tested on tail latency."
date = 2026-01-28
[taxonomies]
tags = ["performance", "rust", "benchmarks"]
+++

We set out to answer a simple question: how does Sentinel stack up against the established reverse proxies?

Envoy, HAProxy, nginx, and Caddy are battle-tested infrastructure that have been optimized over years — some over decades. Sentinel is newer, built on Cloudflare's [Pingora](https://github.com/cloudflare/pingora) framework in Rust. We wanted to know where we stood.

The initial answer: Sentinel's latency was competitive but it was burning more CPU than it should. So we dug in, profiled, and fixed the bottlenecks we found. Three rounds of targeted optimization later, Sentinel matches or beats every proxy we tested on tail latency while maintaining a small memory footprint.

This post walks through what we measured, what we changed, and what we learned.

## The benchmark setup

All five proxies were configured as equivalently as possible: listen on port 8080, forward to a backend on `127.0.0.1:9000`, access logging disabled, keepalive enabled. The backend was [miniserve](https://github.com/svenstaro/miniserve) serving a static directory. Load was generated using [oha](https://github.com/hatoo/oha) at 10,000 requests/second with 100 concurrent connections over 60 seconds, with latency correction enabled.

Everything ran natively on the same machine — no Docker, no network hops. Each proxy was benchmarked sequentially with a 10-second cooldown between runs to avoid resource contention.

## Starting point

The initial benchmark told a clear story. Sentinel's latency was competitive but its CPU usage stood out:

| Proxy | p50 | p99 | Peak Memory | Avg CPU |
|-------|-----|-----|-------------|---------|
| Sentinel | 0.43ms | 0.77ms | 49.1MB | 57.7% |
| nginx | 0.41ms | 0.83ms | 309.9MB | 32.1% |
| Envoy | 0.68ms | 1.25ms | 41.1MB | 34.4% |
| Caddy | 0.58ms | 1.19ms | 55.8MB | 103.6% |
| HAProxy | 0.88ms | 38.34ms | 25.7MB | 39.9% |

Sentinel already had the best p99 of the group, but was burning 57.7% CPU to get there. That extra CPU was doing *something*, and it wasn't making requests faster. The question was: what's eating those cycles?

## Round 1: The agent header map

The first thing we found was in the agent processing path. Sentinel's [agent architecture](https://sentinel.raskell.io/agents/) allows external processes to inspect and modify requests. Even when no agents are configured on a route, the code path that prepares headers for agent processing was doing unnecessary work.

In `handlers.rs`, every request with agent filters rebuilt a `HashMap<String, Vec<String>>` from scratch:

```rust
// Before: three sources of waste
let mut headers_map = HashMap::new();
for (name, value) in req_header.headers.iter() {
    headers_map
        .entry(name.as_str().to_lowercase())  // (1) redundant lowercase
        .or_insert_with(Vec::new)             // (2) less idiomatic
        .push(value.to_str().unwrap_or("").to_string());
}
```

Three problems here:

1. **Redundant `to_lowercase()`** — Pingora normalizes HTTP/1.1 header names on parse, and HTTP/2 headers are lowercase by spec. The `to_lowercase()` call allocated a new `String` for every header on every request, doing nothing useful.

2. **No pre-allocation** — The HashMap grew incrementally. Since we know the header count upfront, `HashMap::with_capacity(headers.len() + 2)` avoids rehashing.

3. **Unnecessary clone downstream** — The HashMap was passed by reference to `process_request_headers`, which then cloned the entire thing to construct the event. Passing it by value (move semantics) eliminated the clone entirely.

```rust
// After: pre-allocated, no redundant lowercase, moved not cloned
let mut headers_map: HashMap<String, Vec<String>> =
    HashMap::with_capacity(req_header.headers.len() + 2);
for (name, value) in req_header.headers.iter() {
    headers_map
        .entry(name.as_str().to_string())
        .or_default()
        .push(value.to_str().unwrap_or("").to_string());
}
// Passed by value — no clone needed downstream
```

## Round 2: Header modification clones

Every request that matched a route with header modification policies (set/add/remove headers on the upstream request) was cloning three collections:

```rust
// Before: clones two HashMaps and a Vec every request
let mods = route_config.policies.request_headers.clone();
for (name, value) in mods.set {
    upstream_request.insert_header(name, value).ok();
}
```

The route config is immutable — it's wrapped in `Arc` and never changes between reloads. There's no reason to clone it. We switched to borrowing:

```rust
// After: borrow the immutable config
let mods = &route_config.policies.request_headers;
for (name, value) in &mods.set {
    upstream_request.insert_header(name.clone(), value.as_str()).ok();
}
```

Header names still need individual clones due to Pingora's `IntoCaseHeaderName` API, but the bulk clone of the entire modification map is gone.

These first two rounds brought CPU from 57.7% down to 49.7%, and p99 from 0.77ms to 0.67ms.

## Round 3: The hot path trifecta

The third round targeted three independent allocations, each on the hottest path — executed on every single request regardless of configuration.

### Route cache key: zero-alloc on cache hit

Sentinel caches route matching results in a `DashMap` (lock-free concurrent HashMap). The cache key is built from the request method, host, and path. Before optimization, this used `format!()`:

```rust
// Before: heap allocation on every request
let cache_key = format!("{}:{}:{}", method, host, path);
```

After warmup, the vast majority of requests are cache hits. The key is used for a single lookup and then discarded. We replaced this with a thread-local buffer that's cleared and reused:

```rust
fn with_cache_key<R>(&self, f: impl FnOnce(&str) -> R) -> R {
    thread_local! {
        static BUF: RefCell<String> = RefCell::new(String::with_capacity(128));
    }

    BUF.with(|buf| {
        let mut buf = buf.borrow_mut();
        buf.clear();
        let _ = write!(buf, "{}:{}:{}", self.method, self.host, self.path);
        f(&buf)
    })
}
```

Zero allocations on cache hits (the steady state). One `to_string()` on cache misses to store the key in the map.

### Metrics status string: static lookup

HTTP status codes were converted to owned strings for metrics labels on every response:

```rust
// Before: heap allocation per request
let label = status.to_string();
```

We replaced this with a static lookup table:

```rust
fn status_str(status: u16) -> &'static str {
    match status {
        200 => "200", 201 => "201", 204 => "204",
        301 => "301", 302 => "302", 304 => "304",
        // ... 20 most common codes
        _ => Box::leak(status.to_string().into_boxed_str()),
    }
}
```

The `Box::leak` fallback for rare status codes leaks at most once per unique code over process lifetime — bounded by the ~60 defined HTTP status codes.

### Access log sampling: skip before constructing

When access log sampling is enabled (e.g., log 10% of requests), the `AccessLogEntry` struct was being fully constructed — roughly 15 string clones for trace ID, route ID, upstream, client IP, method, path, user agent, etc. — before the sampling decision discarded it.

We moved the sampling check before entry construction:

```rust
pub fn should_log_access(&self, status: u16) -> bool {
    if self.access_log.is_none() {
        return false;
    }
    if let Some(ref config) = self.access_log_config {
        if config.sample_errors_always && status >= 400 {
            return true;
        }
        return rand::rng().random::<f64>() < config.sample_rate;
    }
    true
}
```

At a 10% sample rate, this skips 90% of the string clones that were previously built and immediately discarded.

## Final results

After all three rounds:

| Proxy | p50 | p99 | Peak Memory | Avg CPU |
|-------|-----|-----|-------------|---------|
| **Sentinel** | **0.38ms** | **0.69ms** | **49.6MB** | **42.1%** |
| nginx | 0.38ms | 0.69ms | 310.2MB | 29.0% |
| Envoy | 0.45ms | 0.88ms | 41.1MB | 27.1% |
| Caddy | 0.49ms | 1.00ms | 55.1MB | 91.2% |
| HAProxy | 0.88ms | 37.32ms | 25.7MB | 38.6% |

Sentinel now matches or beats every proxy on latency while keeping a small memory footprint. The CPU gap with the C/C++ proxies narrowed significantly — from nearly 2x down to roughly 1.5x — and the remaining difference is accounted for by security headers that Sentinel adds by default and kernel-level overhead outside our control.

### Progression across rounds

| Metric | Baseline | Rounds 1-2 | Round 3 |
|--------|----------|------------|---------|
| p50 | 0.43ms | 0.39ms | **0.38ms** |
| p99 | 0.77ms | 0.67ms | **0.69ms** |
| CPU | 57.7% | 49.7% | **42.1%** |

## Where the remaining CPU goes

After the optimizations, we profiled Sentinel under load to understand what the remaining CPU was actually doing:

| Component | % of CPU |
|-----------|----------|
| TCP connection syscalls | ~47% |
| Response I/O (sendto) | ~7% |
| Response header insertion | ~4% |
| Header serialization | ~1% |
| Everything else | ~41% |

The 47% TCP connection overhead is a test artifact — the profiling setup wasn't pooling backend connections. In production with warmed connection pools, this cost drops to near-zero.

The 4% in response header insertion comes from Sentinel's security headers (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`). This is the cost of adding security value over a raw proxy — and it's the right tradeoff.

The rest is kernel I/O, Pingora framework internals (HTTP parsing, connection management), and jemalloc. All outside Sentinel's control.

## What we got wrong

Not every suggestion panned out. A few things we investigated that turned out to be non-issues:

**"200+ trace!() calls cause overhead"** — Actually 65 `trace!()` calls. When the trace level is disabled (production default), each macro compiles down to a single atomic load + comparison. At 10,000 requests/second, 65 always-false atomic comparisons per request cost roughly nothing. Removing them would trade real observability for unmeasurable gains.

**"UUID trace ID generation is expensive"** — Sentinel uses TinyFlake, not UUIDs. The IDs are 11 characters, not 36. Not a meaningful allocation.

**"Route config clone is expensive"** — The route config is `Arc<RouteConfig>`. Cloning it is a single atomic refcount increment.

**"Agent metadata allocations are significant"** — The `RequestMetadata` struct does allocate several strings, but agent calls involve Unix domain socket serialization and IPC. The metadata cost is noise compared to the serialization overhead.

## Takeaways

**Profile before optimizing.** Several plausible-sounding suggestions were wrong when checked against actual code. Data beats intuition.

**Move semantics are free performance.** Passing owned data to functions that need ownership anyway eliminates clones with zero API cost. This is one of Rust's strengths — the compiler tells you exactly when you're copying data unnecessarily.

**Thread-local buffers eliminate hot path allocations.** For operations that run on every request with predictable buffer sizes, thread-local reuse is strictly better than per-call allocation.

**Know when to stop.** Once profiling shows CPU time dominated by kernel syscalls and framework internals, further optimization yields diminishing returns. The proxy is doing real work — the overhead is the work itself.

## Try it yourself

All the optimizations described in this post ship in Sentinel v0.4.5 (release [26.01_11](https://github.com/raskell-io/sentinel/releases/tag/26.01_11)). You can grab it and run your own benchmarks:

```bash
# From crates.io
cargo install sentinel-proxy

# Or download a prebuilt binary (Linux, macOS)
curl -fsSL https://sentinel.raskell.io/install.sh | sh

# Or pull the container image
docker pull ghcr.io/raskell-io/sentinel:26.01_11
```

---

The full benchmark results are available on the [benchmarks page](/benchmarks/), including interactive charts for latency, throughput, memory, and CPU across all five proxies.
