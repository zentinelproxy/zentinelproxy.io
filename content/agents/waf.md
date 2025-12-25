+++
title = "WAF (Web Application Firewall)"
description = "OWASP CRS-compatible web application firewall with SQL injection, XSS, and attack detection."
template = "agent.html"

[taxonomies]
tags = ["security", "waf", "core"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Beta"
version = "0.1.0"
license = "MIT"
repo = "https://github.com/raskell-io/sentinel-agent-waf"
homepage = "https://sentinel.raskell.io/agents/waf/"
protocol_version = "0.1"

# Installation methods
crate_name = "sentinel-agent-waf"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Overview

The WAF agent provides web application firewall capabilities compatible with OWASP Core Rule Set (CRS). Detect and block common web attacks including SQL injection, cross-site scripting (XSS), and more.

## Features

- **OWASP CRS Compatible**: Uses industry-standard rule sets
- **Attack Detection**: SQL injection, XSS, path traversal, RCE
- **Anomaly Scoring**: Configurable thresholds for blocking
- **Audit Logging**: Detailed logs of detected attacks
- **Request Body Inspection**: Analyze POST data and JSON payloads

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-waf
```

### Using Docker

```bash
docker pull ghcr.io/raskell-io/sentinel-agent-waf:latest
```

### Docker Compose

```yaml
services:
  waf-agent:
    image: ghcr.io/raskell-io/sentinel-agent-waf:latest
    volumes:
      - /var/run/sentinel:/var/run/sentinel
      - ./waf-rules:/etc/sentinel/waf-rules:ro
    environment:
      - SOCKET_PATH=/var/run/sentinel/waf.sock
      - ANOMALY_THRESHOLD=5
```

## Configuration

Add the agent to your Sentinel configuration:

```kdl
agent "waf" {
    socket "/var/run/sentinel/waf.sock"
    timeout 200ms
    fail-open true  // Don't block if WAF fails

    config {
        anomaly-threshold 5
        paranoia-level 1
        inspect-body true
        max-body-size "1MB"

        // Enable specific rule categories
        rules {
            sqli true
            xss true
            rce true
            lfi true
            rfi true
        }
    }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `anomaly-threshold` | integer | `5` | Score threshold for blocking |
| `paranoia-level` | integer | `1` | 1-4, higher = more strict |
| `inspect-body` | boolean | `true` | Inspect request body |
| `max-body-size` | string | `"1MB"` | Maximum body size to inspect |

### Paranoia Levels

| Level | Description |
|-------|-------------|
| 1 | Minimal false positives, catches obvious attacks |
| 2 | Balance between security and usability |
| 3 | Stricter rules, more false positives possible |
| 4 | Maximum security, requires tuning |

## Response Headers

When a request is blocked or flagged:

| Header | Description |
|--------|-------------|
| `X-WAF-Score` | Anomaly score for the request |
| `X-WAF-Rules` | Triggered rule IDs (comma-separated) |
| `X-WAF-Action` | Action taken: `pass`, `block`, `log` |

## Test Payloads

### SQL Injection Test

```bash
curl -i "http://localhost:8080/api/users?id=1' OR '1'='1"
```

### XSS Test

```bash
curl -i "http://localhost:8080/search?q=<script>alert(1)</script>"
```

### Expected Response (Blocked)

```http
HTTP/1.1 403 Forbidden
X-WAF-Score: 15
X-WAF-Rules: 942100,942200
X-WAF-Action: block
Content-Type: application/json

{"error": "request_blocked", "reason": "waf_violation", "rules": ["942100", "942200"]}
```

## Examples

### Production Configuration

```kdl
agent "waf" {
    socket "/var/run/sentinel/waf.sock"
    timeout 200ms
    fail-open true

    config {
        anomaly-threshold 5
        paranoia-level 2
        inspect-body true
        max-body-size "2MB"

        // Log all, block high-score
        log-threshold 3
        block-threshold 5

        // Exclude trusted paths
        exclude-paths [
            "/health"
            "/metrics"
            "/internal/*"
        ]

        rules {
            sqli true
            xss true
            rce true
            lfi true
            rfi false  // Disable remote file inclusion rules
        }
    }
}
```

### API-Specific WAF

```kdl
agent "waf" {
    socket "/var/run/sentinel/waf.sock"

    config {
        anomaly-threshold 3
        paranoia-level 1
        inspect-body true

        // JSON-specific settings
        content-types ["application/json"]
        json-depth 10

        rules {
            sqli true
            xss true
        }
    }
}
```
