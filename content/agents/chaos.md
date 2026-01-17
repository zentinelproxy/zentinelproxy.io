+++
title = "Chaos Engineering"
description = "Controlled fault injection for resilience testing: latency, errors, timeouts, and more with flexible targeting and safety controls."
template = "agent.html"

[taxonomies]
tags = ["chaos", "testing", "resilience", "fault-injection"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "MIT"
repo = "https://github.com/raskell-io/sentinel-agent-chaos"
homepage = "https://sentinel.raskell.io/agents/chaos/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-chaos"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Protocol v2 Features

As of v0.2.0, the Chaos Engineering agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status with draining awareness
- **Metrics export**: Counter metrics for faults injected per experiment
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

The Chaos Engineering agent provides **controlled fault injection** for resilience testing. It allows you to inject latency, errors, and failures into HTTP traffic based on configurable rules and targeting criteria.

<div class="info-notice">

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Latency Injection** | Add fixed or random delays to requests |
| **Error Injection** | Return specific HTTP status codes |
| **Timeout Simulation** | Simulate upstream timeouts (504) |
| **Response Corruption** | Inject garbage into responses |
| **Connection Reset** | Simulate connection failures (502) |
| **Safety Controls** | Schedule windows, excluded paths, kill switch |

</div>

## Features

### Latency Injection

Add delay before proxying requests. Supports fixed delays or random ranges:

```yaml
experiments:
  - id: "api-latency"
    targeting:
      paths:
        - prefix: "/api/"
      percentage: 10
    fault:
      type: latency
      fixed_ms: 500                # Fixed 500ms delay

  - id: "random-latency"
    targeting:
      percentage: 5
    fault:
      type: latency
      min_ms: 100                  # Random 100-1000ms
      max_ms: 1000
```

### Error Injection

Return HTTP errors immediately without proxying:

```yaml
experiments:
  - id: "payment-errors"
    targeting:
      paths:
        - exact: "/api/payments"
      percentage: 5
    fault:
      type: error
      status: 500
      message: "Chaos: Internal Server Error"
      headers:
        x-chaos-injected: "true"
```

### Timeout Simulation

Simulate upstream timeouts by sleeping then returning 504:

```yaml
experiments:
  - id: "upstream-timeout"
    targeting:
      paths:
        - regex: "^/api/external/.*"
      percentage: 2
    fault:
      type: timeout
      duration_ms: 30000           # 30 second timeout
```

### Response Corruption

Inject garbage into responses (probabilistic):

```yaml
experiments:
  - id: "corrupt-response"
    targeting:
      percentage: 1
    fault:
      type: corrupt
      probability: 0.5             # 50% of targeted get corrupted
```

### Connection Reset

Simulate connection failures (returns 502):

```yaml
experiments:
  - id: "connection-reset"
    targeting:
      paths:
        - prefix: "/api/unstable/"
      percentage: 3
    fault:
      type: reset
```

## Targeting

### Path Matching

Multiple matching strategies:

```yaml
targeting:
  paths:
    - exact: "/api/users"          # Exact match
    - prefix: "/api/"              # Prefix match
    - regex: "^/api/v\\d+/.*"      # Regex pattern
```

### Header-Based Activation

Trigger chaos only when specific headers are present:

```yaml
targeting:
  headers:
    x-chaos-enabled: "true"
```

This is useful for testing - developers can add the header to trigger faults on demand.

### Percentage Selection

Affect only a percentage of matching requests:

```yaml
targeting:
  percentage: 10                   # Affect 10% of matching requests
```

## Safety Controls

### Schedule Windows

Only run chaos during specific times:

```yaml
safety:
  schedule:
    - days: [mon, tue, wed, thu, fri]
      start: "09:00"
      end: "17:00"
      timezone: "America/New_York"
```

### Excluded Paths

Protect critical endpoints:

```yaml
safety:
  excluded_paths:
    - "/health"
    - "/ready"
    - "/metrics"
```

### Kill Switch

Disable all chaos instantly:

```yaml
settings:
  enabled: false
```

### Dry Run Mode

Log what would happen without affecting traffic:

```yaml
settings:
  dry_run: true
```

Or via command line:

```bash
sentinel-agent-chaos --dry-run
```

## Installation

### From Cargo

```bash
cargo install sentinel-agent-chaos
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-chaos.git
cd sentinel-agent-chaos
cargo build --release
```

## Configuration

### CLI Options

```bash
sentinel-agent-chaos [OPTIONS]

Options:
  -c, --config <FILE>       Path to configuration file [default: chaos.yaml]
  -s, --socket <PATH>       Unix socket path [default: /tmp/sentinel-chaos.sock]
      --grpc-address <ADDR> gRPC listen address (e.g., 0.0.0.0:50051)
  -L, --log-level <LEVEL>   Log level [default: info]
      --print-config      Print example configuration and exit
      --validate          Validate configuration and exit
      --dry-run           Run in dry-run mode
  -h, --help              Print help
  -V, --version           Print version
```

### Sentinel Integration

Add the agent to your Sentinel proxy configuration:

```yaml
agents:
  - name: chaos
    socket: /tmp/sentinel-chaos.sock
    on_request: true
    on_response: false
```

### Full Configuration Example

```yaml
settings:
  enabled: true
  dry_run: false
  log_injections: true

safety:
  max_affected_percent: 50
  schedule:
    - days: [mon, tue, wed, thu, fri]
      start: "09:00"
      end: "17:00"
      timezone: "UTC"
  excluded_paths:
    - "/health"
    - "/ready"
    - "/metrics"

experiments:
  - id: "api-latency"
    enabled: true
    description: "Add latency to API calls"
    targeting:
      paths:
        - prefix: "/api/"
      percentage: 10
    fault:
      type: latency
      min_ms: 100
      max_ms: 500

  - id: "header-triggered"
    enabled: true
    description: "Latency when X-Chaos header present"
    targeting:
      headers:
        x-chaos-latency: "true"
      percentage: 100
    fault:
      type: latency
      fixed_ms: 2000
```

## Response Headers

When faults are injected, the following headers are added:

| Header | Description |
|--------|-------------|
| `x-chaos-injected` | Always `"true"` when a fault was injected |
| `x-chaos-experiment` | ID of the experiment that was applied |

## Best Practices

1. **Start with dry run mode** - Verify targeting before enabling
2. **Use low percentages** - Start with 1-5% and increase gradually
3. **Always exclude health checks** - Ensure `/health`, `/ready` are protected
4. **Set schedule windows** - Only run during business hours
5. **Use header triggers for testing** - Controlled testing without affecting production
6. **Monitor logs** - Track how many faults are being injected
