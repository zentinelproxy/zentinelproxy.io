+++
title = "SentinelSec"
weight = 60
description = "Pure Rust ModSecurity-compatible WAF with full OWASP CRS support - no C dependencies required."
template = "agent.html"

[taxonomies]
tags = ["security", "waf", "modsecurity", "owasp", "crs", "pure-rust"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-sentinelsec"
homepage = "https://sentinel.raskell.io/agents/sentinelsec/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-sentinelsec"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Protocol v2 Features

As of v0.2.0, the SentinelSec agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status for monitoring
- **Metrics export**: Counter metrics for requests processed/blocked/allowed
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

SentinelSec is a pure Rust ModSecurity-compatible WAF agent for Sentinel. It provides full OWASP Core Rule Set (CRS) support with **zero C dependencies** - no libmodsecurity installation required.

> **Beta Release:** This agent is feature-complete and undergoing final testing. API is stable but may have minor adjustments before 1.0.

## Features

- **Full OWASP CRS Compatibility**: Parse and execute 800+ CRS rules
- **Pure Rust Implementation**: No libmodsecurity or C dependencies
- **Built-in SQLi/XSS Detection**: Native `@detectSQLi` and `@detectXSS` operators
- **SecLang Support**: Load standard ModSecurity rule files
- **Request Body Inspection**: JSON, form data, XML, and all content types
- **Response Body Inspection**: Detect data leakage (opt-in)
- **Block or Detect-Only Mode**: Monitor before blocking
- **Zero Installation Hassle**: Just `cargo install`, no system dependencies

## Performance: 10-30x Faster than C++

SentinelSec uses the [sentinel-modsec](/docs/sentinel-modsec/) engine, a pure Rust implementation that **outperforms the C++ libmodsecurity by 10-30x**.

<div class="stats-grid">
    <div class="stat-card">
        <div class="stat-value stat-value--success">30x</div>
        <div class="stat-label">Faster</div>
        <div class="stat-detail">Clean requests</div>
    </div>
    <div class="stat-card">
        <div class="stat-value stat-value--success">18x</div>
        <div class="stat-label">Faster</div>
        <div class="stat-detail">Attack detection</div>
    </div>
    <div class="stat-card">
        <div class="stat-value stat-value--success">6.2M</div>
        <div class="stat-label">Requests/sec</div>
        <div class="stat-detail">vs 207K for libmodsec</div>
    </div>
</div>

| Benchmark | SentinelSec (Rust) | libmodsecurity (C++) | Speedup |
|-----------|--------------------|-----------------------|---------|
| Clean request | 161 ns | 4,831 ns | **30x faster** |
| SQLi detection | 295 ns | 5,545 ns | **19x faster** |
| Body processing | 1.24 µs | 12.93 µs | **10x faster** |
| Rule parsing | 2.75 µs | 10.07 µs | **3.6x faster** |

**Why is Rust faster?**
- Zero-copy parsing with `Cow<str>`
- PHF (Perfect Hash Functions) for O(1) operator lookup
- Lazy regex compilation - defer to first use
- Aho-Corasick for multi-pattern matching
- No FFI overhead or cross-language memory allocation

See [full benchmarks](/benchmarks/#rust-vs-c-sentinel-modsec-vs-libmodsecurity) for details.

## Comparison

| Feature | SentinelSec | ModSec | WAF |
|---------|-------------|--------|-----|
| Detection Rules | 800+ CRS rules | 800+ CRS rules | ~20 regex rules |
| SecLang Support | Yes | Yes | No |
| @detectSQLi/@detectXSS | Yes (pure Rust) | Yes (C lib) | No |
| Dependencies | **Pure Rust** | libmodsecurity (C) | Pure Rust |
| Performance | **6.2M req/s** | 207K req/s | ~8M req/s |
| Binary Size | ~10MB | ~50MB | ~5MB |
| Installation | `cargo install` | Requires libmodsecurity | `cargo install` |

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install sentinelsec

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### Using Cargo

```bash
cargo install sentinel-agent-sentinelsec
```

## Configuration

### Command Line

```bash
sentinel-sentinelsec-agent \
  --socket /var/run/sentinel/sentinelsec.sock \
  --rules /etc/modsecurity/crs/crs-setup.conf \
  --rules "/etc/modsecurity/crs/rules/*.conf"
```

### Environment Variables

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-sentinelsec.sock` |
| `--grpc-address` | `AGENT_GRPC_ADDRESS` | gRPC listen address (e.g., `0.0.0.0:50051`) | - |
| `--rules` | `SENTINELSEC_RULES` | Rule file paths (glob patterns) | - |
| `--block-mode` | `SENTINELSEC_BLOCK_MODE` | Block (true) or detect-only | `true` |
| `--exclude-paths` | `SENTINELSEC_EXCLUDE_PATHS` | Paths to exclude | - |
| `--body-inspection` | `SENTINELSEC_BODY_INSPECTION` | Enable body inspection | `true` |
| `--max-body-size` | `SENTINELSEC_MAX_BODY_SIZE` | Max body size to inspect | `1048576` (1MB) |
| `--response-inspection` | `SENTINELSEC_RESPONSE_INSPECTION` | Enable response inspection | `false` |
| `--verbose`, `-v` | `SENTINELSEC_VERBOSE` | Enable debug logging | `false` |

### Sentinel Configuration

```kdl
agent "sentinelsec" {
    socket "/var/run/sentinel/sentinelsec.sock"
    timeout 100ms
    events ["request_headers" "request_body_chunk" "response_body_chunk"]
}

route {
    match { path-prefix "/" }
    agents ["sentinelsec"]
    upstream "backend"
}
```

## OWASP CRS Setup

### Download CRS

```bash
# Clone the CRS repository
sudo mkdir -p /etc/modsecurity
sudo git clone https://github.com/coreruleset/coreruleset /etc/modsecurity/crs

# Copy example configuration
sudo cp /etc/modsecurity/crs/crs-setup.conf.example /etc/modsecurity/crs/crs-setup.conf
```

### Run with CRS

```bash
sentinel-sentinelsec-agent \
  --socket /var/run/sentinel/sentinelsec.sock \
  --rules /etc/modsecurity/crs/crs-setup.conf \
  --rules "/etc/modsecurity/crs/rules/*.conf"
```

## Paranoia Levels

Configure in `/etc/modsecurity/crs/crs-setup.conf`:

```apache
SecAction "id:900000,phase:1,pass,t:none,nolog,setvar:tx.blocking_paranoia_level=1"
```

| Level | Description | Use Case |
|-------|-------------|----------|
| 1 | Standard protection, minimal false positives | Production |
| 2 | Elevated protection, some false positives | Security-sensitive apps |
| 3 | High protection, moderate false positives | Staging/testing |
| 4 | Maximum protection, high false positives | Security research |

## Response Headers

| Header | Description |
|--------|-------------|
| `X-WAF-Blocked` | `true` if request was blocked |
| `X-WAF-Rule` | Rule ID that triggered the block |
| `X-WAF-Message` | Detection message |
| `X-WAF-Detected` | Detection message (detect-only mode) |

## CRS Rule Categories

| File Pattern | Protection |
|--------------|------------|
| REQUEST-913-* | Scanner detection |
| REQUEST-920-* | Protocol enforcement |
| REQUEST-930-* | Local file inclusion (LFI) |
| REQUEST-931-* | Remote file inclusion (RFI) |
| REQUEST-932-* | Remote code execution (RCE) |
| REQUEST-941-* | Cross-site scripting (XSS) |
| REQUEST-942-* | SQL injection |
| REQUEST-943-* | Session fixation |
| REQUEST-944-* | Java attacks |
| RESPONSE-950-* | Data leakage |

## When to Use SentinelSec

**Use SentinelSec when:**
- You want full CRS compatibility without C dependencies
- You need easy deployment (`cargo install`)
- You want built-in SQLi/XSS detection
- You're running in environments where installing libmodsecurity is difficult

**Use [ModSec agent](/agents/modsec/) when:**
- You need maximum compatibility with existing ModSecurity deployments
- You have complex custom rules that require libmodsecurity-specific features

**Use [WAF agent](/agents/waf/) when:**
- You want minimal overhead (~5MB binary)
- Basic attack detection is sufficient
- You don't need SecLang rule files

## Related Agents

| Agent | Integration |
|-------|-------------|
| **ModSec** | C-based libmodsecurity (maximum compatibility) |
| **WAF** | Lightweight, pure Rust (~20 rules) |
| **AI Gateway** | AI-specific security controls |
| **Auth** | Combine with authentication |
