+++
title = "Response Cache"
description = "High-performance response caching with TTL controls, cache tags, and programmatic invalidation."
template = "agent.html"

[taxonomies]
tags = ["performance", "caching"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Planned"
version = ""
license = "MIT"
repo = "https://github.com/raskell-io/sentinel"
protocol_version = "0.1"

# Not yet available
# crate_name = "sentinel-agent-cache"
# docker_image = "ghcr.io/raskell-io/sentinel-agent-cache"
+++

## Overview

> **Status: Planned** - This agent is on the roadmap but not yet available.

The Response Cache agent will accelerate your services by caching upstream responses. Planned support for memory and Redis backends with flexible invalidation strategies.

## Planned Features

- **Multiple Backends**: In-memory LRU or Redis for distributed caching
- **Smart Key Generation**: Customizable cache keys including headers and query params
- **Cache Tags**: Group cached items for bulk invalidation
- **Stale-While-Revalidate**: Serve stale content while refreshing in background

## Proposed Configuration

```kdl
agent "cache" {
    socket "/var/run/sentinel/cache.sock"
    timeout 50ms
    fail-open true

    config {
        backend "memory"  // or "redis"
        max-size "512MB"
        default-ttl 300

        rules {
            "/api/products/*" {
                ttl 3600
                vary ["Accept-Language"]
                tags ["products"]
            }

            "/api/users/*" {
                bypass true
            }
        }
    }
}
```

## Cache Control

The agent will respect standard HTTP cache headers:

- `Cache-Control: no-store` - Bypass cache
- `Cache-Control: max-age=N` - Override TTL
- `Vary: Header` - Include header in cache key

## Contribute

Interested in helping build this agent? Check out the [agent template](https://github.com/raskell-io/sentinel-agent-template) and [open an issue](https://github.com/raskell-io/sentinel/issues) to discuss!
