+++
title = "Zentinel — security-first reverse proxy"
description = "A security-first reverse proxy built on Pingora: explicit configuration, bounded resources, and WAF and auth in isolated agents."
template = "index.html"

[extra]
# The "What Zentinel is" part of /llms.txt and /llms-full.txt, written by
# scripts/llms.py. The rest of those files comes from page front matter and
# content. Each line is a claim about the product: check it against
# zentinelproxy/zentinel before changing it, and avoid counts that go stale.
llms_about = """
Zentinel is a security-first reverse proxy built to guard the free web. It is written in Rust on Cloudflare's [Pingora](https://github.com/cloudflare/pingora), through a fork published on crates.io as `zentinel-pingora-*`.

- **Configuration:** KDL, in one file or several joined with `include`. Validated with `zentinel test`; `zentinel lint` reports settings that are being ignored. Reloaded on `SIGHUP`, or on file change with `auto-reload`, and validated before an atomic swap.
- **Routing and upstreams:** routes match on host and path; load balancing includes round robin, least connections, consistent hashing, Maglev and power of two choices; active health checks over HTTP, TCP and gRPC; retries and circuit breakers.
- **TLS:** termination with per-SNI certificates, client certificates (mTLS) and ACME issuance. HTTP/1.1 and HTTP/2 downstream and upstream; HTTP/3 is not implemented.
- **Traffic handling:** response caching, rate limiting, GeoIP filtering (MaxMind and IP2Location databases), response compression with gzip, Brotli or zstd negotiated from `Accept-Encoding`, and static file serving.
- **Agents:** WAF, authentication and other policy run in agents, separate processes the proxy talks to over Unix domain sockets or gRPC (optionally with TLS) using agent protocol v2. Each agent has its own timeout and a `failure-mode` of open or closed, so a slow or crashed agent does not take the proxy down. The [agent registry](https://registry.zentinelproxy.io/) lists agents for WAF and ModSecurity rules, bot management, IP reputation, authentication and SPIFFE identity, GraphQL, gRPC and SOAP inspection, and scripting in Lua, JavaScript or WebAssembly. SDKs for writing agents exist for Rust, Go, Python, TypeScript, Kotlin, Elixir and Haskell.
- **Observability:** Prometheus metrics and structured access, error and audit logs. OpenTelemetry tracing and Redis or memcached-backed distributed rate limiting are build features (`opentelemetry`, `distributed-rate-limit`), not in the default build.
- **Licence:** Apache 2.0.
"""
+++
