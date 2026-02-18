+++
title = "ZentinelSec"
weight = 60
description = "Pure Rust ModSecurity-compatible WAF with full OWASP CRS support - no C dependencies required."
template = "agent.html"

[taxonomies]
tags = ["security", "waf", "modsecurity", "owasp", "crs", "pure-rust"]

[extra]
official = true
author = "Zentinel Core Team"
author_url = "https://github.com/zentinelproxy"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/zentinelproxy/zentinel-agent-zentinelsec"
homepage = "https://zentinelproxy.io/agents/zentinelsec/"
protocol_version = "v2"

# Installation methods
crate_name = "zentinel-agent-zentinelsec"
docker_image = ""

# Compatibility
min_zentinel_version = "26.01.0"
+++

## Protocol v2 Features

As of v0.2.0, the ZentinelSec agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status for monitoring
- **Metrics export**: Counter metrics for requests processed/blocked/allowed
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

ZentinelSec is a pure Rust ModSecurity-compatible WAF agent for Zentinel. It provides full OWASP Core Rule Set (CRS) support with **zero C dependencies** - no libmodsecurity installation required.

> **Note:** CRS compatibility depends on the [zentinel-modsec](https://github.com/zentinelproxy/zentinel-modsec) engine, a pure Rust reimplementation of libmodsecurity. If you encounter unsupported SecLang features, please [file an issue](https://github.com/zentinelproxy/zentinel-agent-zentinelsec/issues).

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

ZentinelSec uses the [zentinel-modsec](https://docs.zentinelproxy.io/zentinel-modsec/) engine, a pure Rust implementation that **outperforms the C++ libmodsecurity by 10-30x**.

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

| Benchmark | ZentinelSec (Rust) | libmodsecurity (C++) | Speedup |
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

> Benchmarks measured with Criterion on the zentinel-modsec library. Measured on Apple M2 Pro, single core. Run `cargo bench` in the [zentinel-modsec repo](https://github.com/zentinelproxy/zentinel-modsec) to reproduce.

See [full benchmarks](/benchmarks/#rust-vs-c-zentinel-modsec-vs-libmodsecurity) for details.

## Comparison

| Feature | ZentinelSec | ModSec | WAF |
|---------|-------------|--------|-----|
| Detection Rules | 800+ CRS rules | 800+ CRS rules | 285 rules |
| SecLang Support | Yes | Yes | No |
| @detectSQLi/@detectXSS | Yes (pure Rust) | Yes (C lib) | No |
| Dependencies | **Pure Rust** | libmodsecurity (C) | Pure Rust |
| Performance | **6.2M req/s** | 207K req/s | (varies) |
| Binary Size | ~10MB | ~50MB | ~5MB |
| Installation | `cargo install` | Requires libmodsecurity | `cargo install` |

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Zentinel bundle command:

```bash
# Install just this agent
zentinel bundle install zentinelsec

# Or install all available agents
zentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.zentinel/agents/`.

### Using Cargo

```bash
cargo install zentinel-agent-zentinelsec
```

## Configuration

### Command Line

```bash
zentinel-zentinelsec-agent \
  --socket /var/run/zentinel/zentinelsec.sock \
  --rules /etc/modsecurity/crs/crs-setup.conf \
  --rules "/etc/modsecurity/crs/rules/*.conf"
```

### Environment Variables

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/zentinel-zentinelsec.sock` |
| `--grpc-address` | `AGENT_GRPC_ADDRESS` | gRPC listen address (e.g., `0.0.0.0:50051`) | - |
| `--rules` | `ZENTINELSEC_RULES` | Rule file paths (glob patterns) | - |
| `--block-mode` | `ZENTINELSEC_BLOCK_MODE` | Block (true) or detect-only | `true` |
| `--exclude-paths` | `ZENTINELSEC_EXCLUDE_PATHS` | Paths to exclude | - |
| `--body-inspection` | `ZENTINELSEC_BODY_INSPECTION` | Enable body inspection | `true` |
| `--max-body-size` | `ZENTINELSEC_MAX_BODY_SIZE` | Max body size to inspect | `1048576` (1MB) |
| `--response-inspection` | `ZENTINELSEC_RESPONSE_INSPECTION` | Enable response inspection | `false` |
| `--verbose`, `-v` | `ZENTINELSEC_VERBOSE` | Enable debug logging | `false` |

### Zentinel Configuration

```kdl
agent "zentinelsec" {
    socket "/var/run/zentinel/zentinelsec.sock"
    timeout 100ms
    events ["request_headers" "request_body_chunk" "response_body_chunk"]
}

route {
    match { path-prefix "/" }
    agents ["zentinelsec"]
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
zentinel-zentinelsec-agent \
  --socket /var/run/zentinel/zentinelsec.sock \
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

## When to Use ZentinelSec

**Use ZentinelSec when:**
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
| **WAF** | Pure Rust, 285 native rules (no SecLang) |
| **AI Gateway** | AI-specific security controls |
| **Auth** | Combine with authentication |
