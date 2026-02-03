+++
title = "gRPC Inspector"
weight = 130
description = "Comprehensive security controls for gRPC services: method authorization, rate limiting, metadata inspection, and reflection control."
template = "agent.html"

[taxonomies]
tags = ["grpc", "security", "authorization", "rate-limiting"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "MIT"
repo = "https://github.com/raskell-io/sentinel-agent-grpc-inspector"
homepage = "https://sentinel.raskell.io/agents/grpc-inspector/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-grpc-inspector"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Protocol v2 Features

As of v0.2.0, the gRPC Inspector agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status for monitoring
- **Metrics export**: Counter metrics for requests processed/blocked/allowed
- **gRPC transport**: High-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

gRPC Inspector provides **comprehensive security controls** for gRPC services. It analyzes gRPC requests at the protocol level, enabling fine-grained authorization, rate limiting, and metadata inspection.

<div class="info-notice">

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Method Authorization** | Allow/deny based on service and method with glob patterns |
| **Reflection Control** | Block or allow gRPC reflection by client IP or metadata |
| **Metadata Inspection** | Required/forbidden headers with validation rules |
| **Message Size Limits** | Per-method request/response size limits |
| **Rate Limiting** | Token bucket rate limiting per service/method/client |

</div>

## Features

### Method-level Authorization

Control access to gRPC services and methods with flexible matching:

```yaml
authorization:
  enabled: true
  default_action: allow
  rules:
    # Allow all methods in PublicService
    - service: "myapp.PublicService"
      methods: ["*"]
      action: allow

    # Deny destructive methods in AdminService
    - service: "myapp.AdminService"
      methods: ["Delete*", "Destroy*"]
      action: deny

    # Block all internal services using regex
    - service_pattern: "^myapp\\.internal\\."
      methods: ["*"]
      action: deny

    # Require roles for sensitive operations
    - service: "myapp.PaymentService"
      methods: ["ProcessPayment", "Refund"]
      action: allow
      require_roles: ["payment_processor"]
      roles_header: "x-user-roles"
```

### Reflection API Control

Protect against service enumeration by controlling gRPC reflection:

```yaml
reflection:
  enabled: true
  allow: false                    # Block by default
  allowed_clients:
    - "127.0.0.1"                 # Allow localhost
    - "10.0.0.0/8"                # Allow internal network
  allowed_metadata:
    name: "x-reflection-key"
    values: ["dev-key-12345"]
```

When reflection is blocked, the agent returns:
- gRPC status: `PERMISSION_DENIED` (7)
- Message: "Reflection API is disabled"

### Metadata Inspection

Enforce header requirements across your gRPC services:

```yaml
metadata:
  enabled: true
  required:
    - name: "x-request-id"        # Require for all methods
    - name: "x-tenant-id"
      apply_to: ["myapp.TenantService/*"]
  forbidden:
    - name: "x-internal-only"
    - name_pattern: "^x-debug-"   # Block debug headers in production
      apply_to: ["myapp.ProductionService/*"]
  validation:
    - name: "content-type"
      allowed_values:
        - "application/grpc"
        - "application/grpc+proto"
```

### Message Size Limits

Prevent oversized requests with configurable per-method limits:

```yaml
size_limits:
  enabled: true
  default_max_request_bytes: 4194304      # 4MB
  default_max_response_bytes: 4194304     # 4MB
  per_method:
    - service: "myapp.FileService"
      method: "Upload"
      max_request_bytes: 104857600        # 100MB for uploads
```

### Rate Limiting

Token bucket rate limiting with flexible key configuration:

```yaml
rate_limiting:
  enabled: true
  default_limit: 1000
  default_window_seconds: 60
  key_type: client_ip              # client_ip, metadata, or composite
  per_method:
    - service: "myapp.AuthService"
      method: "Login"
      limit: 10
      window_seconds: 60
      burst: 2
    - service: "myapp.SearchService"
      methods: ["*"]
      limit: 100
      window_seconds: 60
      key_type: metadata
      key_metadata_name: "x-user-id"
```

## gRPC Status Codes

The agent returns appropriate gRPC status codes when blocking requests:

| Scenario | gRPC Status | Code |
|----------|-------------|------|
| Method denied | PERMISSION_DENIED | 7 |
| Missing required metadata | UNAUTHENTICATED | 16 |
| Insufficient roles | PERMISSION_DENIED | 7 |
| Rate limited | RESOURCE_EXHAUSTED | 8 |
| Request too large | RESOURCE_EXHAUSTED | 8 |
| Invalid request | INVALID_ARGUMENT | 3 |

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install grpc-inspector

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### From Cargo

```bash
cargo install sentinel-agent-grpc-inspector
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-grpc-inspector.git
cd sentinel-agent-grpc-inspector
cargo build --release
```

## Configuration

### CLI Options

```bash
sentinel-agent-grpc-inspector [OPTIONS]

Options:
  -c, --config <FILE>       Path to configuration file [default: grpc-inspector.yaml]
  -s, --socket <PATH>       Unix socket path
  -g, --grpc-address <ADDR> gRPC listen address (e.g., 0.0.0.0:50051)
  -L, --log-level <LEVEL>   Log level [default: info]
      --print-config      Print example configuration and exit
      --validate          Validate configuration and exit
  -h, --help              Print help
  -V, --version           Print version
```

### Sentinel Integration

Add the agent to your Sentinel proxy configuration:

```yaml
agents:
  - name: grpc-inspector
    socket: /tmp/sentinel-grpc-inspector.sock
    on_request: true
    on_response: false
```

### Full Configuration Example

```yaml
settings:
  fail_action: block        # block or allow (detect-only mode)
  debug_headers: false      # Add X-Grpc-Inspector-* debug headers
  log_blocked: true         # Log blocked requests
  log_allowed: false        # Log allowed requests (verbose)

authorization:
  enabled: true
  default_action: allow
  rules:
    - service: "myapp.PublicService"
      methods: ["*"]
      action: allow
    - service: "myapp.AdminService"
      methods: ["Delete*"]
      action: deny

size_limits:
  enabled: true
  default_max_request_bytes: 4194304
  per_method:
    - service: "myapp.FileService"
      method: "Upload"
      max_request_bytes: 104857600

metadata:
  enabled: true
  required:
    - name: "x-request-id"
  forbidden:
    - name: "x-internal-only"

rate_limiting:
  enabled: true
  default_limit: 1000
  default_window_seconds: 60
  per_method:
    - service: "myapp.AuthService"
      method: "Login"
      limit: 10
      window_seconds: 60

reflection:
  enabled: true
  allow: false
  allowed_clients:
    - "127.0.0.1"
    - "10.0.0.0/8"
```

## Health Checks

The agent automatically allows gRPC health check requests (`grpc.health.v1.Health/*`) without inspection to ensure your service health probes work correctly.

## Debugging

Enable debug headers to see which service and method the agent detected:

```yaml
settings:
  debug_headers: true
```

This adds the following headers to allowed requests:
- `X-Grpc-Inspector-Service`: The detected service name
- `X-Grpc-Inspector-Method`: The detected method name
