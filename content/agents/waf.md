+++
title = "WAF (Web Application Firewall)"
description = "Lightweight WAF with native Rust regex patterns for SQL injection, XSS, and attack detection."
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

A lightweight Web Application Firewall agent for Sentinel using **native Rust regex patterns**. Provides zero-dependency attack detection without requiring libmodsecurity or other C libraries.

> **Note:** This agent implements a curated subset of detection rules inspired by OWASP CRS rule IDs, but does not use the full CRS ruleset. For full OWASP CRS compatibility with 800+ rules, see [ModSecurity agent](/agents/modsec/).

## Features

- **Pure Rust**: No external C dependencies
- **SQL Injection Detection**: UNION-based, blind, time-based
- **XSS Detection**: Script tags, event handlers, JavaScript URIs
- **Path Traversal**: Directory traversal, encoded attacks
- **Command Injection**: Shell commands, pipe injection
- **Scanner Detection**: Block known security scanners
- **Request Body Inspection**: JSON, form data, all content types
- **Response Body Inspection**: Detect attacks in server responses (optional)
- **Paranoia Levels**: 1-4 for tuning sensitivity
- **Detect-Only Mode**: Monitor without blocking

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-waf
```

## Configuration

### Command Line

```bash
sentinel-waf-agent --socket /var/run/sentinel/waf.sock --paranoia-level 1
```

### Environment Variables

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-waf.sock` |
| `--paranoia-level` | `WAF_PARANOIA_LEVEL` | Sensitivity (1-4) | `1` |
| `--sqli` | `WAF_SQLI` | Enable SQL injection detection | `true` |
| `--xss` | `WAF_XSS` | Enable XSS detection | `true` |
| `--path-traversal` | `WAF_PATH_TRAVERSAL` | Enable path traversal detection | `true` |
| `--command-injection` | `WAF_COMMAND_INJECTION` | Enable command injection | `true` |
| `--protocol` | `WAF_PROTOCOL` | Enable protocol attack detection | `true` |
| `--block-mode` | `WAF_BLOCK_MODE` | Block (true) or detect-only (false) | `true` |
| `--exclude-paths` | `WAF_EXCLUDE_PATHS` | Paths to exclude (comma-separated) | - |
| `--body-inspection` | `WAF_BODY_INSPECTION` | Enable request body inspection | `true` |
| `--max-body-size` | `WAF_MAX_BODY_SIZE` | Maximum body size (bytes) | `1048576` (1MB) |
| `--response-inspection` | `WAF_RESPONSE_INSPECTION` | Enable response body inspection | `false` |
| `--verbose`, `-v` | `WAF_VERBOSE` | Enable debug logging | `false` |

### Sentinel Configuration

```kdl
agent "waf" {
    socket "/var/run/sentinel/waf.sock"
    timeout 50ms
    events ["request_headers" "request_body_chunk"]
}

route {
    match { path-prefix "/" }
    agents ["waf"]
    upstream "backend"
}
```

## Paranoia Levels

| Level | Description |
|-------|-------------|
| 1 | High-confidence detections only (recommended for production) |
| 2 | Adds medium-confidence rules, more false positives possible |
| 3 | Adds low-confidence rules, requires tuning |
| 4 | Maximum sensitivity, expect false positives |

## Detection Rules

Rules follow OWASP CRS numbering conventions for familiarity.

### SQL Injection (942xxx)
- UNION-based injection
- Tautology attacks (`OR 1=1`)
- Comment injection (`--`, `#`, `/**/`)
- Time-based blind injection (`SLEEP()`, `BENCHMARK()`)

### Cross-Site Scripting (941xxx)
- Script tag injection (`<script>`)
- Event handler injection (`onclick=`, `onerror=`)
- JavaScript URI (`javascript:`)
- Data URI (`data:text/html`)

### Path Traversal (930xxx)
- Directory traversal (`../`, `..\\`)
- URL-encoded traversal (`%2e%2e%2f`)
- OS file access (`/etc/passwd`, `c:\\windows`)

### Command Injection (932xxx)
- Shell command injection (`; ls`, `| cat`)
- Unix command execution (`$(...)`, backticks)
- Windows command execution

### Protocol Attacks (920xxx)
- Scanner detection (Nikto, SQLMap, etc.)
- Request smuggling patterns
- Control characters

## Response Headers

| Header | Description |
|--------|-------------|
| `X-WAF-Blocked` | `true` if request was blocked |
| `X-WAF-Rule` | Rule ID that triggered block |
| `X-WAF-Detected` | Rule IDs detected (detect-only mode) |

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
X-WAF-Blocked: true
X-WAF-Rule: 942100
```

## Comparison with ModSecurity Agent

| Feature | WAF | ModSecurity |
|---------|-----|-------------|
| Detection Rules | ~20 rules | 800+ CRS rules |
| SecLang Support | No | Yes |
| Custom Rules | No | Yes |
| Dependencies | Pure Rust | libmodsecurity (C) |
| Binary Size | ~5MB | ~50MB |
| Memory Usage | Low | Higher |
| Installation | `cargo install` | Requires libmodsecurity |

**Use WAF when:**
- You want zero-dependency deployment
- You need low latency and minimal resources
- Basic attack detection is sufficient

**Use [ModSecurity](/agents/modsec/) when:**
- You need full OWASP CRS compatibility
- You have existing ModSecurity/SecLang rules
- You require comprehensive 800+ rule protection

## False Positive Handling

1. **Lower paranoia level** - Start with level 1, increase gradually
2. **Exclude paths** - Skip known-safe endpoints (`--exclude-paths`)
3. **Detect-only mode** - Monitor before enabling blocking
4. **Switch to ModSecurity** - For fine-grained rule tuning

## Related Agents

| Agent | Integration |
|-------|-------------|
| **ModSecurity** | Full OWASP CRS with 800+ rules |
| **AI Gateway** | AI-specific security controls |
| **Rate Limiter** | Combine with rate limiting |
