+++
title = "Rate Limiter"
description = "Token bucket rate limiting with configurable windows and limits per route, IP, or custom keys."
template = "agent.html"

[taxonomies]
tags = ["security", "traffic", "core"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.1.0"
license = "MIT"
repo = "https://github.com/raskell-io/sentinel-agent-ratelimit"
homepage = "https://sentinel.raskell.io/agents/ratelimit/"
protocol_version = "0.1"

# Installation methods
crate_name = "sentinel-agent-ratelimit"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Overview

The Rate Limiter agent provides flexible traffic control using the token bucket algorithm. Protect your upstream services from traffic spikes and abuse.

## Features

- **Token Bucket Algorithm**: Industry-standard rate limiting with burst support
- **Multiple Key Types**: Limit by IP, route, header value, or custom extractors
- **Sliding Window**: Accurate rate limiting with sliding window counters
- **Graceful Handling**: Configurable behavior for limit exceeded scenarios

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-ratelimit
```

### Using Docker

```bash
docker pull ghcr.io/raskell-io/sentinel-agent-ratelimit:latest
```

### Docker Compose

```yaml
services:
  ratelimit-agent:
    image: ghcr.io/raskell-io/sentinel-agent-ratelimit:latest
    volumes:
      - /var/run/sentinel:/var/run/sentinel
    environment:
      - SOCKET_PATH=/var/run/sentinel/ratelimit.sock
```

## Configuration

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

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `default-limit` | integer | `100` | Maximum requests per window |
| `window-seconds` | integer | `60` | Time window in seconds |
| `burst-size` | integer | `20` | Additional burst capacity |
| `key-type` | string | `"ip"` | Rate limit key: `ip`, `route`, `header` |
| `header-name` | string | - | Header to use when `key-type` is `header` |

### Per-Route Limits

```kdl
agent "ratelimit" {
    socket "/var/run/sentinel/ratelimit.sock"

    config {
        default-limit 100
        window-seconds 60

        route "/api/auth/*" {
            limit 10
            window-seconds 60
        }

        route "/api/upload" {
            limit 5
            window-seconds 300
        }
    }
}
```

## Response Headers

When enabled, the agent adds standard rate limit headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed |
| `X-RateLimit-Remaining` | Requests remaining in window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

## Test Payloads

### Basic Rate Limit Test

```bash
# Send 10 requests rapidly to trigger rate limiting
for i in {1..10}; do
  curl -i http://localhost:8080/api/test
done
```

### Expected Response (Rate Limited)

```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1703520000
Content-Type: application/json

{"error": "rate_limit_exceeded", "retry_after": 45}
```

## Examples

### API Gateway with Tiered Limits

```kdl
agent "ratelimit" {
    socket "/var/run/sentinel/ratelimit.sock"

    config {
        // Default for all routes
        default-limit 1000
        window-seconds 3600

        // Stricter limits for auth endpoints
        route "/api/auth/*" {
            limit 10
            window-seconds 60
        }

        // Generous limits for read operations
        route "/api/v1/read/*" {
            limit 5000
            window-seconds 3600
        }

        // Strict limits for write operations
        route "/api/v1/write/*" {
            limit 100
            window-seconds 3600
        }
    }
}
```

### IP-Based with Header Fallback

```kdl
agent "ratelimit" {
    socket "/var/run/sentinel/ratelimit.sock"

    config {
        default-limit 100
        window-seconds 60
        key-type "header"
        header-name "X-Forwarded-For"
        fallback-key-type "ip"
    }
}
```
