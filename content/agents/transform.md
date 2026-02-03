+++
title = "Transform"
weight = 110
description = "Advanced request and response transformation with URL rewriting, header manipulation, and JSON body transforms."
template = "agent.html"

[taxonomies]
tags = ["transformation", "rewriting", "core"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-transform"
homepage = "https://sentinel.raskell.io/agents/transform/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-transform"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Protocol v2 Features

As of v0.2.0, the Transform agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status for monitoring
- **Metrics export**: Counter metrics for requests processed/transformed
- **gRPC transport**: High-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

A configuration-driven transformation agent for Sentinel that provides advanced request and response modifications. Supports URL rewriting with regex capture groups, header manipulation with variable interpolation, and comprehensive JSON body transformations.

## Features

- **URL Rewriting**: Regex-based path rewriting with named capture groups (`${resource}`, `${id}`)
- **Header Manipulation**: Add, set, or remove headers with variable interpolation
- **JSON Body Transforms**: Set, delete, rename, wrap, merge, copy, and move operations
- **Variable Interpolation**: Access request data, captures, and body fields in transforms
- **Conditional Matching**: Match on path patterns, HTTP methods, headers, and JSON body content
- **Priority-Based Rules**: First-match evaluation with configurable rule priorities
- **Debug Headers**: Optional `X-Transform-Rule` and `X-Transform-Time` response headers

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install transform

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### Using Cargo

```bash
cargo install sentinel-agent-transform
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-transform
cd sentinel-agent-transform
cargo build --release
```

## Configuration

### Command Line

```bash
sentinel-agent-transform \
    --socket /var/run/sentinel/transform.sock \
    --grpc-address 0.0.0.0:50051 \
    --config /etc/sentinel/transform.yaml
```

### CLI Options

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-transform.sock` |
| `--grpc-address` | `TRANSFORM_GRPC_ADDRESS` | gRPC listen address | `0.0.0.0:50051` |
| `--config` | `TRANSFORM_CONFIG` | Configuration file path | (required) |

### Sentinel Configuration

```kdl
agent "transform" {
    socket "/var/run/sentinel/transform.sock"
    timeout 50ms
    events ["request_headers" "request_body" "response_headers" "response_body"]
}

route {
    match { path-prefix "/api/v1" }
    agents ["transform"]
    upstream "backend"
}
```

### Agent Configuration (YAML)

```yaml
version: "1"
settings:
  max_body_size: 10485760   # 10MB
  debug_headers: false
  timeout_ms: 100

rules:
  - name: "api-v1-to-v2-migration"
    enabled: true
    priority: 100
    match:
      path:
        pattern: "^/api/v1/(?P<resource>\\w+)/(?P<id>\\d+)$"
        type: regex
      methods: [GET, POST, PUT, DELETE]
    request:
      url:
        rewrite: "/api/v2/${resource}/${id}"
        preserve_query: true
      headers:
        add:
          - { name: "X-API-Version", value: "2" }
          - { name: "X-Migrated-From", value: "v1" }
    response:
      headers:
        add:
          - { name: "Deprecation", value: "true" }
          - { name: "Sunset", value: "2026-06-01" }
```

## Rule Structure

### Match Conditions

Rules are evaluated in priority order (highest first). A rule matches when all specified conditions are true:

| Condition | Description |
|-----------|-------------|
| `path.pattern` | Path matching (exact, glob, or regex) |
| `path.type` | Pattern type: `exact`, `glob`, `regex` |
| `methods` | List of allowed HTTP methods |
| `headers` | Header conditions (equals, contains, present, absent) |
| `body.json` | JSON path conditions for request body |
| `response.status_codes` | Response status codes to match |
| `response.content_types` | Response Content-Type patterns |

### Path Matching Examples

```yaml
# Exact match
path:
  pattern: "/api/health"
  type: exact

# Glob pattern
path:
  pattern: "/api/*/users/*"
  type: glob

# Regex with named captures
path:
  pattern: "^/api/v(?P<version>\\d+)/(?P<resource>\\w+)$"
  type: regex
```

### Header Conditions

```yaml
headers:
  - name: "Content-Type"
    contains: "json"
  - name: "Authorization"
    present: true
  - name: "X-Debug"
    absent: true
  - name: "X-API-Key"
    equals: "secret123"
```

### Body Matching (JSON)

```yaml
body:
  json:
    - path: "$.type"
      equals: "user"
    - path: "$.auth_token"
      exists: true
    - path: "$.message"
      contains: "error"
```

## Transformations

### URL Rewriting

```yaml
request:
  url:
    rewrite: "/api/v2/${resource}/${id}"
    preserve_query: true
    add_query:
      version: "2"
      source: "${request.client_ip}"
    remove_query:
      - debug
      - trace
```

### Header Manipulation

```yaml
request:
  headers:
    add:                    # Add if not present
      - { name: "X-Request-ID", value: "${correlation_id}" }
    set:                    # Always set (overwrite)
      - { name: "X-Forwarded-For", value: "${request.client_ip}" }
    remove:
      - "X-Internal-Token"
      - "X-Debug"

response:
  headers:
    add:
      - { name: "X-Response-Time", value: "${now}" }
    remove:
      - "Server"
      - "X-Powered-By"
```

### JSON Body Transforms

```yaml
request:
  body:
    json:
      operations:
        # Set a value at a path
        - set:
            path: "$.metadata.version"
            value: "2.0"

        # Delete fields
        - delete:
            - "$.internal_id"
            - "$.debug_info"

        # Rename a field
        - rename:
            from: "$.old_field"
            to: "$.new_field"

        # Wrap the entire body
        - wrap:
            path: "$"
            key: "data"

        # Merge additional fields
        - merge:
            path: "$"
            with:
              api_version: "2"
              processed_at: "${now}"

        # Copy a value
        - copy:
            from: "$.user.id"
            to: "$.metadata.user_id"

        # Move a value
        - move:
            from: "$.legacy.field"
            to: "$.modern.field"
```

## Variable Interpolation

Variables can be used in header values, URL rewrites, and JSON transforms:

| Variable | Description |
|----------|-------------|
| `${request.path}` | Request path |
| `${request.method}` | HTTP method |
| `${request.query}` | Query string |
| `${request.client_ip}` | Client IP address |
| `${request.header.X-Custom}` | Request header value |
| `${response.status}` | Response status code |
| `${response.header.Content-Type}` | Response header value |
| `${correlation_id}` | Request correlation ID |
| `${now}` | Current timestamp (ISO 8601) |
| `${resource}` | Named regex capture group |
| `${1}`, `${2}` | Numbered regex capture groups |
| `${body.user.name}` | Request body JSON path |
| `${response_body.data.id}` | Response body JSON path |

## Common Use Cases

### API Version Migration

```yaml
rules:
  - name: "v1-to-v2-migration"
    match:
      path:
        pattern: "^/api/v1/(.*)$"
        type: regex
    request:
      url:
        rewrite: "/api/v2/${1}"
    response:
      headers:
        add:
          - { name: "Deprecation", value: "true" }
```

### Add Correlation Headers

```yaml
rules:
  - name: "correlation-headers"
    match:
      path:
        pattern: "^/api/.*$"
        type: regex
    request:
      headers:
        add:
          - { name: "X-Correlation-ID", value: "${correlation_id}" }
          - { name: "X-Request-Start", value: "${now}" }
```

### Remove Sensitive Response Headers

```yaml
rules:
  - name: "sanitize-response"
    match:
      path:
        pattern: "*"
        type: glob
    response:
      headers:
        remove:
          - "Server"
          - "X-Powered-By"
          - "X-AspNet-Version"
```

### Wrap API Responses

```yaml
rules:
  - name: "wrap-response"
    match:
      path:
        pattern: "^/api/.*$"
        type: regex
      response:
        content_types: ["application/json"]
    response:
      body:
        json:
          operations:
            - wrap:
                path: "$"
                key: "data"
            - merge:
                path: "$"
                with:
                  success: true
                  timestamp: "${now}"
```

### Normalize Backend Responses

```yaml
rules:
  - name: "normalize-user-response"
    match:
      path:
        pattern: "^/api/users/.*$"
        type: regex
    response:
      body:
        json:
          operations:
            - rename:
                from: "$.firstName"
                to: "$.first_name"
            - rename:
                from: "$.lastName"
                to: "$.last_name"
            - delete:
                - "$.internal_id"
                - "$.password_hash"
```

## Debug Mode

Enable debug headers to see which rules are applied:

```yaml
settings:
  debug_headers: true
```

Response headers added:
- `X-Transform-Rule`: Name of the applied rule
- `X-Transform-Time`: Processing time in milliseconds

## Performance

- **Latency**: <2ms typical transform time
- **Memory**: ~20MB base + rule complexity
- **Throughput**: >100k requests/second

## Related Agents

| Agent | Integration |
|-------|-------------|
| **Auth** | Transform after authentication for user context |
| **WAF** | Transform before WAF for normalization |
| **Bot Management** | Add bot headers before transformation |

## Comparison with Alternatives

| Feature | Transform Agent | Nginx Lua | Envoy Lua |
|---------|----------------|-----------|-----------|
| Config-driven | Yes | No (code) | No (code) |
| Hot reload | Yes | Partial | No |
| JSON transforms | Full | Manual | Manual |
| Variable interpolation | Built-in | Manual | Manual |
| Regex captures | Named + numbered | Manual | Manual |
| Debug headers | Built-in | Manual | Manual |
