+++
title = "Rate Limiter"
weight = 10
description = "Token bucket rate limiting with configurable windows and limits per route, IP, or custom keys."
template = "agent.html"

[taxonomies]
tags = ["security", "traffic", "deprecated"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Deprecated"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-ratelimit"
homepage = "https://sentinel.raskell.io/agents/ratelimit/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-ratelimit"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

<div class="deprecation-notice">

## Deprecated

**This agent is deprecated as of Sentinel v26.01.** Rate limiting is now built into Sentinel core with more features and better performance.

Please use [Sentinel's built-in rate limiting](/configuration/limits/) instead.

</div>

## Migration Guide

Sentinel now includes comprehensive rate limiting natively. Here's how to migrate:

### Before (Agent)

```kdl
agent "ratelimit" {
    socket "/var/run/sentinel/ratelimit.sock"
    timeout 100ms

    config {
        default-limit 100
        window-seconds 60
        burst-size 20
        key-type "ip"
    }
}

route {
    match { path-prefix "/api/" }
    agents ["ratelimit"]
    upstream "backend"
}
```

### After (Built-in)

```kdl
rate-limit "api-limit" {
    limit 100
    window 60s
    burst 20
    key client-ip
    action reject
}

route {
    match { path-prefix "/api/" }
    rate-limit "api-limit"
    upstream "backend"
}
```

## Built-in Rate Limiting Features

Sentinel's native rate limiting offers more capabilities than this agent:

| Feature | Agent | Built-in |
|---------|-------|----------|
| Token bucket algorithm | Yes | Yes |
| Key types (IP, header, custom) | Yes | Yes |
| Per-route limits | Yes | Yes |
| Distributed (Redis) | No | Yes |
| Distributed (Memcached) | No | Yes |
| Challenge action | No | Yes |
| Delay action | No | Yes |
| Scope-aware (namespace/service) | No | Yes |
| Lock-free local limiting | No | Yes |

### Distributed Rate Limiting

The built-in rate limiter supports distributed backends for multi-instance deployments:

```kdl
rate-limit "global-api-limit" {
    limit 10000
    window 60s
    key api-key
    action reject

    backend redis {
        url "redis://localhost:6379"
        key-prefix "sentinel:ratelimit:"
    }
}
```

### Multiple Actions

Built-in rate limiting supports multiple actions beyond simple rejection:

```kdl
rate-limit "login-limit" {
    limit 5
    window 60s
    key client-ip
    action challenge  // Issue CAPTCHA challenge instead of blocking
}

rate-limit "api-throttle" {
    limit 100
    window 1s
    key client-ip
    action delay 100ms  // Slow down instead of rejecting
}
```

### Scope-Aware Limits

Apply rate limits per namespace or service:

```kdl
namespace "tenant-a" {
    rate-limit "tenant-limit" {
        limit 1000
        window 60s
        key client-ip
    }
}
```

## Documentation

For complete documentation on built-in rate limiting, see:

- [Rate Limiting Configuration](/configuration/limits/)
- [Features: Rate Limiting](/features/#rate-limiting)

---

## Legacy Documentation

The following documentation is preserved for users still migrating from the agent.

### Protocol v2 Features

As of v0.2.0, the rate limiter agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status with load metrics
- **Metrics export**: Counter and gauge metrics for monitoring
- **gRPC transport**: Optional high-performance gRPC transport
- **Lifecycle hooks**: Graceful shutdown and drain handling
- **Flow control**: Backpressure-aware request handling

### Overview

The Rate Limiter agent provides flexible traffic control using the token bucket algorithm. Protect your upstream services from traffic spikes and abuse.

### Features

- **Token Bucket Algorithm**: Industry-standard rate limiting with burst support
- **Multiple Key Types**: Limit by IP, route, header value, or custom extractors
- **Sliding Window**: Accurate rate limiting with sliding window counters
- **Graceful Handling**: Configurable behavior for limit exceeded scenarios

### Installation

#### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install ratelimit

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

#### Using Cargo

```bash
cargo install sentinel-agent-ratelimit
```

#### Using Docker

```bash
docker pull ghcr.io/raskell-io/sentinel-agent-ratelimit:latest
```

### CLI Options

| Option | Env Var | Default | Description |
|--------|---------|---------|-------------|
| `--socket` | `RATELIMIT_AGENT_SOCKET` | `/var/run/sentinel/ratelimit.sock` | UDS socket path |
| `--grpc-address` | `RATELIMIT_AGENT_GRPC_ADDRESS` | - | gRPC listen address (e.g., `0.0.0.0:50051`) |
| `--log-level` | `RUST_LOG` | `info` | Log level (trace, debug, info, warn, error) |
| `--json-logs` | - | `false` | Output logs in JSON format |

### Configuration

Add the agent to your Sentinel configuration:

```kdl
agent "ratelimit" {
    socket "/var/run/sentinel/ratelimit.sock"
    timeout 100ms
    fail-open false

    config {
        default-limit 100
        window-seconds 60
        burst-size 20
        key-type "ip"
    }
}
```

#### gRPC Transport (v2)

For higher throughput, use gRPC transport:

```kdl
agent "ratelimit" {
    grpc "localhost:50051"
    timeout 100ms
    fail-open false
    protocol "v2"

    config {
        default-limit 100
        window-seconds 60
        burst-size 20
        key-type "ip"
    }
}
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default-limit` | integer | `100` | Maximum requests per window |
| `window-seconds` | integer | `60` | Time window in seconds |
| `burst-size` | integer | `20` | Additional burst capacity |
| `key-type` | string | `"ip"` | Rate limit key: `ip`, `route`, `header` |
| `header-name` | string | - | Header to use when `key-type` is `header` |

### Response Headers

When enabled, the agent adds standard rate limit headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed |
| `X-RateLimit-Remaining` | Requests remaining in window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
