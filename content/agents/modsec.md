+++
title = "ModSecurity"
description = "Full OWASP Core Rule Set (CRS) support via libmodsecurity with 800+ detection rules."
template = "agent.html"

[taxonomies]
tags = ["security", "waf", "modsecurity", "owasp", "crs"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-modsec"
homepage = "https://sentinel.raskell.io/agents/modsec/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-modsec"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Protocol v2 Features

As of v0.2.0, the ModSecurity agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status for monitoring
- **Metrics export**: Metrics for WAF operations
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

ModSecurity WAF agent for Sentinel reverse proxy. Provides full OWASP Core Rule Set (CRS) support via libmodsecurity bindings with 800+ detection rules.

> **Note:** This agent requires libmodsecurity installed on your system. For a lightweight, zero-dependency alternative with basic detection rules, see [WAF agent](/agents/waf/).

## Features

- **Full OWASP CRS Support**: 800+ detection rules out of the box
- **SecLang Compatibility**: Load any ModSecurity rules
- **Request Body Inspection**: JSON, form data, XML, and all content types
- **Response Body Inspection**: Detect data leakage (opt-in)
- **Block or Detect-Only Mode**: Monitor before blocking
- **Path Exclusions**: Skip inspection for trusted paths
- **Paranoia Levels**: 1-4, balance security vs. false positives

## Prerequisites

This agent requires libmodsecurity >= 3.0.13:

**macOS:**
```bash
brew install modsecurity
```

**Ubuntu/Debian:**
```bash
apt install libmodsecurity-dev
```

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-modsec
```

## Configuration

### Command Line

```bash
sentinel-modsec-agent \
  --socket /var/run/sentinel/modsec.sock \
  --rules /etc/modsecurity/crs/crs-setup.conf \
  --rules "/etc/modsecurity/crs/rules/*.conf"
```

### Environment Variables

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-modsec.sock` |
| `--grpc-address` | `AGENT_GRPC_ADDRESS` | gRPC listen address (e.g., `0.0.0.0:50051`) | - |
| `--rules` | `MODSEC_RULES` | Paths to rule files (supports glob patterns like `*.conf`) | - |
| `--block-mode` | `MODSEC_BLOCK_MODE` | Block (true) or detect-only (false) | `true` |
| `--exclude-paths` | `MODSEC_EXCLUDE_PATHS` | Paths to exclude (comma-separated) | - |
| `--body-inspection` | `MODSEC_BODY_INSPECTION` | Enable request body inspection | `true` |
| `--max-body-size` | `MODSEC_MAX_BODY_SIZE` | Maximum body size to inspect | `1048576` (1MB) |
| `--response-inspection` | `MODSEC_RESPONSE_INSPECTION` | Enable response body inspection | `false` |
| `--verbose`, `-v` | `MODSEC_VERBOSE` | Enable debug logging | `false` |

### Sentinel Configuration

```kdl
agent "modsec" {
    socket "/var/run/sentinel/modsec.sock"
    timeout 100ms
    events ["request_headers" "request_body_chunk" "response_body_chunk"]
}

route {
    match { path-prefix "/" }
    agents ["modsec"]
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
sentinel-modsec-agent \
  --socket /var/run/sentinel/modsec.sock \
  --rules /etc/modsecurity/crs/crs-setup.conf \
  --rules "/etc/modsecurity/crs/rules/*.conf"
```

## Paranoia Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| 1 | Standard protection, minimal false positives | Production - most applications |
| 2 | Elevated protection, some false positives | Security-sensitive apps |
| 3 | High protection, moderate false positives | Staging/testing, or with tuning |
| 4 | Maximum protection, high false positives | Security research |

Configure in `/etc/modsecurity/crs/crs-setup.conf`:

```apache
SecAction "id:900000,phase:1,pass,t:none,nolog,setvar:tx.blocking_paranoia_level=1"
```

## Response Headers

| Header | Description |
|--------|-------------|
| `X-WAF-Blocked` | `true` if request was blocked |
| `X-WAF-Message` | ModSecurity message |
| `X-WAF-Detected` | Detection message (detect-only mode) |

## CRS Rule Categories

| File | Protection |
|------|------------|
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

## Comparison with WAF Agent

| Feature | ModSecurity | WAF |
|---------|-------------|-----|
| Detection Rules | 800+ CRS rules | ~20 regex rules |
| SecLang Support | Yes | No |
| Custom Rules | Yes | No |
| Dependencies | libmodsecurity (C) | Pure Rust |
| Binary Size | ~50MB | ~5MB |
| Installation | Requires libmodsecurity | `cargo install` |

**Use ModSecurity when:**
- You need full OWASP CRS compatibility
- You have existing ModSecurity/SecLang rules
- You require comprehensive protection

**Use [WAF agent](/agents/waf/) when:**
- You want zero-dependency deployment
- You need low latency and minimal resources
- Basic attack detection is sufficient

## Related Agents

| Agent | Integration |
|-------|-------------|
| **WAF** | Lightweight, pure Rust alternative |
| **AI Gateway** | AI-specific security controls |
| **Auth** | Combine with authentication |

> **Note:** For rate limiting, use [Sentinel's built-in rate limiting](/configuration/limits/) instead of an agent.
