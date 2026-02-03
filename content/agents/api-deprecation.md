+++
title = "API Deprecation"
weight = 210
description = "API lifecycle management agent with RFC 8594 Sunset headers, usage tracking, automatic redirects, and migration support for graceful API deprecation."
template = "agent.html"

[taxonomies]
tags = ["api", "deprecation", "lifecycle", "sunset", "migration"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-api-deprecation"
homepage = "https://sentinel.raskell.io/agents/api-deprecation/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-api-deprecation"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Overview

An API lifecycle management agent for Sentinel that helps you gracefully deprecate and sunset API endpoints. The agent adds standard RFC-compliant deprecation headers, tracks usage metrics, and supports flexible actions from warnings to redirects to blocking.

Perfect for managing API versioning, communicating breaking changes to clients, and monitoring migration progress.

## Protocol v2 Features

As of v0.2.0, the API Deprecation agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status with draining awareness
- **Metrics export**: Gauge metrics for endpoint counts and days until sunset
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Features

- **RFC 8594 Sunset Headers**: Standard-compliant sunset date headers
- **Deprecation Headers**: Clear deprecation warnings with dates
- **Usage Tracking**: Prometheus metrics for monitoring deprecated endpoint usage
- **Flexible Actions**: Warn, redirect, block, or custom responses
- **Automatic Redirects**: Redirect old endpoints to new versions with query preservation
- **Migration Support**: Include documentation links in deprecation notices
- **Glob Patterns**: Match multiple endpoints with glob-style patterns
- **Configurable Past-Sunset Behavior**: Control what happens after sunset date

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install api-deprecation

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### Using Cargo

```bash
cargo install sentinel-agent-api-deprecation
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-api-deprecation
cd sentinel-agent-api-deprecation
cargo build --release
```

## Configuration

Create `api-deprecation.yaml`:

```yaml
endpoints:
  - id: legacy-users-api
    path: /api/v1/users
    methods: [GET, POST, PUT, DELETE]
    status: deprecated
    deprecated_at: "2024-01-01T00:00:00Z"
    sunset_at: "2025-06-01T00:00:00Z"
    replacement:
      path: /api/v2/users
      preserve_query: true
    documentation_url: https://docs.example.com/migration/users
    message: "Please migrate to the v2 API"
    action:
      type: warn

settings:
  past_sunset_action: warn
  log_access: true
```

## Sentinel Configuration

Add to your Sentinel proxy configuration:

```kdl
agents {
    api-deprecation socket="/tmp/sentinel-api-deprecation.sock"
}
```

## Usage Examples

### Gradual Migration with Warnings

Track usage while giving clients time to migrate:

```yaml
endpoints:
  - id: users-v1
    path: /api/v1/users
    status: deprecated
    sunset_at: "2025-06-01T00:00:00Z"
    replacement:
      path: /api/v2/users
    documentation_url: https://docs.example.com/migration
    action:
      type: warn
```

Response headers:
```
Deprecation: @1704067200
Sunset: Sun, 01 Jun 2025 00:00:00 GMT
Link: <https://docs.example.com/migration>; rel="deprecation", </api/v2/users>; rel="successor-version"
X-Deprecation-Notice: This endpoint (/api/v1/users) is deprecated...
```

### Automatic Redirects

Force clients to use the new endpoint:

```yaml
endpoints:
  - id: old-products
    path: /products/*
    status: deprecated
    replacement:
      path: /api/v2/products
      preserve_query: true
    action:
      type: redirect
      status_code: 308
```

Requests to `/products/123?color=blue` redirect to `/api/v2/products?color=blue`.

### Removed Endpoints

Return 410 Gone for completely removed endpoints:

```yaml
endpoints:
  - id: legacy-auth
    path: /auth/legacy
    status: removed
    documentation_url: https://docs.example.com/sunset-notice
    action:
      type: block
      status_code: 410
```

Response:
```json
{
  "error": "endpoint_removed",
  "message": "The endpoint /auth/legacy has been removed",
  "documentation": "https://docs.example.com/sunset-notice"
}
```

### Scheduled Deprecation

Announce upcoming deprecation before it takes effect:

```yaml
endpoints:
  - id: users-v1-scheduled
    path: /api/v1/users
    status: scheduled
    deprecated_at: "2025-01-01T00:00:00Z"
    sunset_at: "2025-06-01T00:00:00Z"
    replacement:
      path: /api/v2/users
    action:
      type: warn
```

### Custom Response

Return a custom message for deprecated endpoints:

```yaml
endpoints:
  - id: custom-deprecation
    path: /old-api/*
    status: deprecated
    action:
      type: custom
      status_code: 403
      body: '{"error": "api_version_unsupported", "message": "This API version is no longer supported. Please upgrade to v3."}'
      content_type: application/json
```

## Actions Reference

| Action | Description | Default Status |
|--------|-------------|----------------|
| `warn` | Allow request, add deprecation headers | - |
| `redirect` | Redirect to replacement endpoint | 308 |
| `block` | Return error response | 410 |
| `custom` | Return custom response | (required) |

## Response Headers

The agent adds these standard headers:

| Header | Description | Example |
|--------|-------------|---------|
| `Deprecation` | Deprecation timestamp (RFC draft) | `@1704067200` or `true` |
| `Sunset` | Removal date (RFC 8594) | `Sun, 01 Jun 2025 00:00:00 GMT` |
| `Link` | Documentation and successor links | `<url>; rel="deprecation"` |
| `X-Deprecation-Notice` | Human-readable message | Full deprecation notice |

## Global Settings

```yaml
settings:
  # Header names (customizable)
  deprecation_header: Deprecation
  sunset_header: Sunset
  link_header: Link
  notice_header: X-Deprecation-Notice

  # Add headers to all matching responses
  include_headers: true

  # Action for endpoints past sunset date
  # Options: warn, block, redirect
  past_sunset_action: warn

  # Log all deprecated endpoint access
  log_access: true
```

## Metrics

Enable the metrics endpoint:

```bash
sentinel-agent-api-deprecation --metrics --metrics-port 9090
```

Available metrics:

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `requests_total` | counter | endpoint_id, path, method, status | Total deprecated requests |
| `redirects_total` | counter | endpoint_id, from_path, to_path | Total redirects |
| `blocked_total` | counter | endpoint_id, path, reason | Total blocked requests |
| `days_until_sunset` | gauge | endpoint_id, path | Days until sunset (negative if past) |
| `request_duration_seconds` | histogram | endpoint_id | Request latency |

Example Prometheus queries:

```promql
# Requests to deprecated endpoints in last hour
sum(increase(sentinel_api_deprecation_requests_total[1h])) by (endpoint_id)

# Endpoints past sunset
sentinel_api_deprecation_days_until_sunset < 0

# Redirect rate
rate(sentinel_api_deprecation_redirects_total[5m])
```

## CLI Options

```bash
sentinel-agent-api-deprecation [OPTIONS]

Options:
  -c, --config <PATH>        Configuration file [default: api-deprecation.yaml]
  -s, --socket <PATH>        Unix socket path [default: /tmp/sentinel-api-deprecation.sock]
      --grpc-address <ADDR>  gRPC listen address (e.g., 0.0.0.0:50051)
  -L, --log-level <LEVEL>    Log level [default: info]
      --print-config         Print default configuration
      --validate             Validate configuration and exit
      --metrics              Enable metrics server
      --metrics-port <PORT>  Metrics server port [default: 9090]
  -h, --help                 Print help
  -V, --version              Print version
```

## Best Practices

1. **Set realistic sunset dates** - Give clients 3-6 months to migrate
2. **Provide documentation links** - Help clients understand what changed
3. **Use warn before redirect** - Start with warnings, then switch to redirects
4. **Monitor metrics** - Track usage to know when migration is complete
5. **Test redirects** - Ensure query parameters are preserved correctly
6. **Log access** - Keep records for debugging migration issues

## Migration Workflow

1. **Announce**: Add endpoint as `scheduled` with future deprecation date
2. **Deprecate**: Change to `deprecated` with `warn` action
3. **Track**: Monitor metrics to see migration progress
4. **Redirect**: Switch to `redirect` action to force migration
5. **Remove**: Change to `removed` with `block` action
6. **Cleanup**: Remove configuration after sunset period
