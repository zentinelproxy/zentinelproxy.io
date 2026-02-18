+++
title = "Zentinel Upgrades to Pingora 0.7: Dropping the Fork, Gaining New Capabilities"
description = "Cloudflare's Pingora 0.7 ships connection-level filtering, extensible TLS context, and the security fixes we were carrying in a fork. Zentinel now runs on upstream Pingora with zero patches — here's what changed and what it unlocks."
date = 2026-02-02
[taxonomies]
tags = ["infrastructure", "pingora", "security", "rust"]
+++

Zentinel exists because of [Pingora](https://github.com/cloudflare/pingora). Cloudflare open-sourced their proxy framework in 2024, and it gave us what would have taken years to build: async I/O, connection pooling, HTTP/1.1 and HTTP/2 handling, TLS termination — all in Rust, all battle-tested at Cloudflare's scale. Zentinel is the security and routing layer on top; Pingora is the engine underneath.

On January 30, Cloudflare released Pingora 0.7.0. We've upgraded Zentinel to run on it. This post covers what changed in Pingora, what it means for Zentinel, and why this upgrade let us drop a fork we'd been maintaining since January.

## Dropping the fork

Since early January, Zentinel shipped with a [patched fork](https://github.com/raskell-io/pingora/tree/0.6.0-security-fixes) of Pingora 0.6. The fork carried three security fixes that upstream hadn't released yet:

| Issue | Severity | What we patched |
|-------|----------|-----------------|
| [RUSTSEC-2026-0002](https://rustsec.org/advisories/RUSTSEC-2026-0002.html) | Medium | `lru` crate vulnerability — upgraded to safe version |
| `atty` dependency | Low | Unmaintained crate pulled in transitively via `clap` — removed |
| `protobuf` recursion | Low | Deeply nested protobuf messages could cause stack overflow — bounded recursion depth |

Maintaining a fork of your foundation framework is operational overhead. Every upstream commit needs evaluation. CI runs against both upstream and fork. Contributors have to understand the patch set. It works, but it's not where you want to be long-term.

Pingora 0.7.0 includes all three fixes. The `lru` crate is upgraded, `atty` is removed, and protobuf handling is hardened. Our `[patch.crates-io]` section — 16 lines of git overrides pointing at our fork — is gone. Zentinel now builds against upstream Pingora with zero patches.

## What's new in Pingora 0.7

The full [release notes](https://github.com/cloudflare/pingora/releases/tag/0.7.0) cover everything. Here are the changes most relevant to a reverse proxy like Zentinel.

### ConnectionFilter trait

Pingora 0.7 adds a `ConnectionFilter` trait that fires immediately after TCP accept — before TLS handshake, before HTTP parsing, before any application logic. This is the earliest point you can inspect a connection:

```rust
async fn connection_filter(&self, conn: &TcpStream) -> Result<bool> {
    let peer_addr = conn.peer_addr()?;
    // Block at TCP level — no TLS overhead for blocked connections
    Ok(!self.is_blocked(peer_addr))
}
```

For Zentinel, this opens the door to TCP-level IP blocking and connection-rate limiting that runs before spending CPU on TLS handshakes. A connection from a blocked IP never allocates a TLS session, never parses HTTP headers, never hits the routing engine. We haven't integrated this yet, but it's the right place for Zentinel's GeoIP filtering and IP reputation checks to eventually live.

### Extensible TLS context

`SslDigestExtensions` lets you attach custom data to the TLS digest on both downstream (client) and upstream (backend) connections. This is useful for propagating mutual TLS client certificate information through the proxy pipeline without re-parsing the certificate at every stage.

### Background subrequests

You can now spawn subrequests from a main session that continue independently. This is relevant for Zentinel's shadow traffic feature — where a copy of the request is sent to a secondary backend for testing — and for fire-and-forget webhook notifications.

### Body-byte tracking

Pingora now tracks request and response body sizes across both HTTP/1.1 and HTTP/2. Zentinel already tracks body sizes for metrics and rate limiting, but having framework-level counters means the numbers are accurate even when the proxy doesn't read the full body (streaming, early termination).

### Cache improvements

Several cache changes affect Zentinel's caching layer:

- **`ForcedInvalidationKind` renamed to `ForcedFreshness`** — a clearer name for what it does (forcing a cached response to be treated as fresh or expired)
- **Multipart range request limits** — `range_header_filter` now accepts a `max_multipart_ranges` parameter, defaulting to 200. This bounds the work done for range requests with many byte ranges, preventing potential abuse
- **Cache lock improvements** — Lock age timeouts are fixed, preventing unnecessary lock reacquisition under contention
- **Header-only cache admission** — Corrected logic for responses that have headers but no body

### Breaking changes we adapted

Two API changes required code modifications in Zentinel:

1. `ForcedInvalidationKind` → `ForcedFreshness` — import and usage rename
2. `range_header_filter` now takes a third parameter (`max_multipart_ranges: Option<usize>`) — we pass `None` to use the default limit of 200

Both were straightforward. No behavior changes, no configuration impact.

## What this means for Zentinel users

Nothing breaks. Zentinel's configuration format, behavior, and APIs are unchanged. The upgrade is purely internal — a better foundation underneath the same proxy.

What you get:

- **No more fork** — Zentinel tracks upstream Pingora directly. Security fixes from Cloudflare reach Zentinel faster.
- **Security fixes included** — The `lru`, `atty`, and `protobuf` issues are resolved via upstream, not patches.
- **Future capabilities** — Connection-level filtering, extensible TLS context, and background subrequests are available for upcoming Zentinel features.
- **Minimum Rust version** — Pingora 0.7 requires Rust 1.83+. Zentinel already requires 1.85+, so no change for our users.

## Alongside Pingora: dependency sweep

This Pingora upgrade was part of a broader dependency update. In the same session, we merged 10 Dependabot PRs covering the full dependency tree:

| Dependency | Change | Notes |
|------------|--------|-------|
| `thiserror` | 1.x → 2.0 | Error derive macro |
| `redis` | 0.27 → 1.0 | Distributed rate limiting backend |
| `criterion` | 0.6 → 0.8 | Benchmarking framework |
| `instant-acme` | 0.7 → 0.8 | ACME certificate management (major API rewrite) |
| `jsonschema` | 0.18 → 0.40 | API schema validation (major API rewrite) |
| `quick-xml` | 0.37 → 0.39 | XML parsing for data masking agent |
| `async-memcached` | 0.5 → 0.6 | Distributed rate limiting backend |
| `tiktoken-rs` | 0.6 → 0.9 | Token counting for inference routing |
| `sysinfo` | 0.37 → 0.38 | System information |

Three of these — `instant-acme`, `jsonschema`, and `quick-xml` — had breaking API changes that required code modifications. The ACME client needed a significant rewrite for `instant-acme` 0.8's new builder pattern and async authorization stream. All changes are in the [main branch](https://github.com/zentinelproxy/zentinel).

The full test suite passes. All 25 test crates, zero failures.

---

Zentinel v0.4.7 ships with Pingora 0.7 and all the dependency updates described above. Grab it:

```bash
# From source
cargo install zentinel-proxy

# Container
docker pull ghcr.io/zentinelproxy/zentinel:26.02_1

# Binary
curl -fsSL https://get.zentinelproxy.io | sh
```
