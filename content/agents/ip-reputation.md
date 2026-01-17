+++
title = "IP Reputation"
description = "IP threat intelligence with AbuseIPDB integration, file-based blocklists, and Tor exit node detection."
template = "agent.html"

[taxonomies]
tags = ["ip-reputation", "threat-intelligence", "security", "blocklist", "tor"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "MIT"
repo = "https://github.com/raskell-io/sentinel-agent-ip-reputation"
homepage = "https://sentinel.raskell.io/agents/ip-reputation/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-ip-reputation"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Protocol v2 Features

As of v0.2.0, the IP Reputation agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status with draining awareness
- **Metrics export**: Counter metrics for lookups, blocks, allowlist matches, failures
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

The IP Reputation agent checks client IPs against **threat intelligence feeds** and **blocklists** to identify and block malicious traffic. It supports multiple reputation sources and configurable thresholds.

<div class="info-notice">

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **AbuseIPDB Integration** | Query AbuseIPDB API for IP reputation scores |
| **Custom Blocklists** | Load blocklists from CSV, JSON, or plain text files |
| **Tor Exit Node Detection** | Check against Tor exit node list |
| **Reputation Thresholds** | Block/allow based on configurable score thresholds |
| **Caching** | Cache lookups with configurable TTL |
| **Fail-Open/Closed** | Configurable behavior when lookup fails |

</div>

## Features

### AbuseIPDB Integration

Query the [AbuseIPDB](https://www.abuseipdb.com/) API for IP reputation scores:

```yaml
abuseipdb:
  enabled: true
  api_key: "${ABUSEIPDB_API_KEY}"  # Use environment variable
  max_age_days: 90             # Only consider reports from last 90 days
  cache_ttl_seconds: 3600      # Cache results for 1 hour
  timeout_ms: 5000             # API timeout
```

The agent caches responses to minimize API calls and latency.

### Custom Blocklists

Load blocklists from files in multiple formats:

```yaml
blocklists:
  - name: "internal-blocklist"
    enabled: true
    path: "/etc/sentinel/blocklist.txt"
    format: plain              # plain, csv, or json
    action: block              # block or flag
    refresh_interval_seconds: 300
```

Supported formats:
- **plain** - One IP/CIDR per line (comments with `#`)
- **csv** - First column is IP/CIDR
- **json** - Array of IP/CIDR strings

### Tor Exit Node Detection

Detect and optionally block Tor exit nodes:

```yaml
tor:
  enabled: true
  action: flag                 # block or flag
  exit_node_list_url: "https://check.torproject.org/torbulkexitlist"
  refresh_interval_seconds: 3600
```

### IP Allowlist

Always allow specific IPs or CIDR ranges:

```yaml
allowlist:
  - "127.0.0.1"
  - "10.0.0.0/8"
  - "192.168.0.0/16"
  - "172.16.0.0/12"
```

## Reputation Thresholds

Configure score thresholds for blocking and flagging:

```yaml
thresholds:
  block_score: 80              # Block if score >= 80
  flag_score: 50               # Flag (add header) if score >= 50
```

Scores range from 0-100, with higher scores indicating worse reputation.

## IP Extraction

Configure how client IPs are extracted from request headers:

```yaml
ip_extraction:
  headers:
    - "x-forwarded-for"
    - "x-real-ip"
    - "cf-connecting-ip"
  use_first_ip: true           # Use first IP from X-Forwarded-For
```

## Fail Action

Configure behavior when provider lookups fail:

```yaml
settings:
  fail_action: allow           # allow or block
```

- `allow` - Fail-open: allow request when lookup fails
- `block` - Fail-closed: block request when lookup fails

## Installation

### From Cargo

```bash
cargo install sentinel-agent-ip-reputation
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-ip-reputation.git
cd sentinel-agent-ip-reputation
cargo build --release
```

## Configuration

### CLI Options

```bash
sentinel-agent-ip-reputation [OPTIONS]

Options:
  -c, --config <FILE>       Path to configuration file [default: ip-reputation.yaml]
  -s, --socket <PATH>       Unix socket path [default: /tmp/sentinel-ip-reputation.sock]
      --grpc-address <ADDR> gRPC listen address (e.g., 0.0.0.0:50051)
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
  - name: ip-reputation
    socket: /tmp/sentinel-ip-reputation.sock
    on_request: true
    on_response: false
```

### Full Configuration Example

```yaml
settings:
  enabled: true
  fail_action: allow
  log_blocked: true
  log_allowed: false

ip_extraction:
  headers:
    - "x-forwarded-for"
    - "x-real-ip"
    - "cf-connecting-ip"
  use_first_ip: true

thresholds:
  block_score: 80
  flag_score: 50

abuseipdb:
  enabled: true
  api_key: "${ABUSEIPDB_API_KEY}"
  max_age_days: 90
  cache_ttl_seconds: 3600
  timeout_ms: 5000

blocklists:
  - name: "internal-blocklist"
    enabled: true
    path: "/etc/sentinel/blocklist.txt"
    format: plain
    action: block
    refresh_interval_seconds: 300

tor:
  enabled: true
  action: flag
  exit_node_list_url: "https://check.torproject.org/torbulkexitlist"
  refresh_interval_seconds: 3600

allowlist:
  - "127.0.0.1"
  - "10.0.0.0/8"
  - "192.168.0.0/16"
  - "172.16.0.0/12"
```

## Response Headers

When blocking or flagging requests, the following headers are added:

| Header | Description |
|--------|-------------|
| `x-ip-reputation-blocked` | Set to `"true"` when request is blocked |
| `x-ip-reputation-flagged` | Set to `"true"` when request is flagged |
| `x-ip-reputation-score` | The reputation score (0-100) |
| `x-ip-reputation-reason` | Why the action was taken |
| `x-ip-reputation-tor` | Set to `"true"` if IP is a Tor exit node |
| `x-ip-reputation-proxy` | Set to `"true"` if IP is a known proxy |

## Best Practices

1. **Always use an allowlist** - Add your infrastructure IPs (load balancers, internal services)
2. **Start with fail-open** - Use `fail_action: allow` until you trust your configuration
3. **Use appropriate thresholds** - 80+ for blocking, 50+ for flagging is a good start
4. **Cache API responses** - Reduce API calls and latency with caching
5. **Monitor blocked IPs** - Enable `log_blocked: true` to track what's being blocked
6. **Refresh blocklists regularly** - Keep Tor and custom blocklists updated
