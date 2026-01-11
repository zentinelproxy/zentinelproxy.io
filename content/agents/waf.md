+++
title = "WAF (Web Application Firewall)"
description = "Next-generation WAF with 200+ detection rules, anomaly scoring, and comprehensive attack coverage."
template = "agent.html"

[taxonomies]
tags = ["security", "waf", "core"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Beta"
version = "0.2.0"
license = "Apache-2.0"
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

A next-generation Web Application Firewall agent for Sentinel featuring **200+ detection rules** and **anomaly-based scoring** to reduce false positives. Built with native Rust regex patterns for zero-dependency attack detection.

## Features

- **200+ Detection Rules**: Comprehensive coverage across 12 attack categories
- **Anomaly Scoring**: Cumulative risk scores instead of binary block/allow
- **Pure Rust**: No external C dependencies
- **SQL Injection**: UNION-based, error-based, blind, time-based, NoSQL
- **XSS Detection**: Script tags, event handlers, DOM-based, polyglots
- **Command Injection**: Unix, Windows, PowerShell
- **Path Traversal**: Directory traversal, encoded attacks, LFI/RFI
- **SSTI**: Server-Side Template Injection (Jinja2, Twig, Freemarker)
- **SSRF**: Cloud metadata, internal IPs, protocol handlers
- **Deserialization**: Java, PHP, Python, .NET, Ruby gadget chains
- **Scanner Detection**: SQLMap, Nikto, Nmap, Burp Suite
- **Request Body Inspection**: JSON, form data, all content types
- **Response Body Inspection**: Detect attacks in server responses
- **Rule Management**: Enable/disable rules, exclusions, score overrides
- **Paranoia Levels**: 1-4 for tuning sensitivity

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

### Dynamic Configuration

Configure scoring thresholds and rule management via the agent protocol:

```json
{
  "paranoia-level": 2,
  "block-mode": true,
  "scoring": {
    "enabled": true,
    "block-threshold": 25,
    "log-threshold": 10
  },
  "rules": {
    "disabled": ["942140", "941200"],
    "exclusions": [
      {
        "rules": ["942*"],
        "conditions": { "paths": ["/api/search"] }
      }
    ]
  }
}
```

## Anomaly Scoring

Instead of blocking on the first rule match, the WAF accumulates anomaly scores and makes decisions based on thresholds.

### Score Calculation

```
final_score = base_score × location_weight × severity_multiplier
```

**Location Weights:**
| Location | Weight |
|----------|--------|
| Query String | 1.5x |
| Cookie | 1.3x |
| Path | 1.2x |
| Body | 1.2x |
| Headers | 1.0x |

**Severity Multipliers:**
| Severity | Multiplier |
|----------|------------|
| Critical | 2.0x |
| High | 1.5x |
| Medium | 1.0x |
| Low | 0.7x |

### Decision Logic

| Total Score | Action |
|-------------|--------|
| < 10 | Allow |
| 10-24 | Allow with warning (logged, `X-WAF-Detected` header) |
| ≥ 25 | Block (403 Forbidden) |

This approach reduces false positives by requiring multiple suspicious patterns or high-confidence attacks before blocking.

## Paranoia Levels

| Level | Description |
|-------|-------------|
| 1 | High-confidence detections only (recommended for production) |
| 2 | Adds medium-confidence rules, more patterns detected |
| 3 | Adds low-confidence rules, requires tuning |
| 4 | Maximum sensitivity, expect false positives |

## Detection Rules

Rules follow OWASP CRS numbering conventions for familiarity. **200+ rules** across 12 categories:

### SQL Injection (942xxx) - 66 rules
- UNION-based injection (SELECT, ALL, INTO)
- Error-based injection (CONVERT, EXTRACTVALUE)
- Blind injection (boolean, time-based)
- Stacked queries, comment injection
- NoSQL injection (MongoDB, Redis, Elasticsearch)

### Cross-Site Scripting (941xxx) - 35 rules
- Script tag injection (`<script>`, `</script>`)
- Event handlers (`onclick`, `onerror`, `onload`)
- JavaScript/VBScript URIs
- Data URIs with HTML content
- DOM-based XSS sinks (`innerHTML`, `eval`)
- CSS-based XSS (`expression()`, `-moz-binding`)
- Polyglot payloads

### Command Injection (932xxx) - 25 rules
- Unix commands (`; ls`, `| cat`, backticks)
- Command substitution (`$(...)`)
- Windows commands (`& dir`, `| type`)
- PowerShell execution

### Path Traversal (930xxx) - 15 rules
- Directory traversal (`../`, `..\\`)
- URL-encoded traversal (`%2e%2e%2f`)
- OS file access (`/etc/passwd`, `c:\\windows`)
- PHP wrappers (`php://filter`, `php://input`)
- Remote File Inclusion (HTTP/FTP includes)

### Server-Side Template Injection (934xxx) - 10 rules
- Jinja2/Twig (`{{...}}`, `{%...%}`)
- Freemarker (`<#...>`, `${...}`)
- Velocity (`#set`, `$class`)
- Expression Language (`${T(...)}`)

### SSRF (936xxx) - 13 rules
- Cloud metadata endpoints (AWS, GCP, Azure)
- Internal IP ranges (10.x, 172.16.x, 192.168.x)
- Localhost/loopback access
- Protocol handlers (`file://`, `gopher://`, `dict://`)
- IP encoding bypasses (octal, decimal, hex)

### Deserialization (937xxx) - 14 rules
- Java serialized objects, gadget chains (Commons Collections, Spring)
- Java JNDI injection (Log4Shell)
- PHP object serialization, POP chains
- Python pickle, PyYAML
- .NET BinaryFormatter, ViewState
- Ruby Marshal

### LDAP Injection (933xxx) - 8 rules
- Filter injection (`*`, `)(`, `|`)
- Attribute injection
- DN manipulation

### XPath Injection (935xxx) - 6 rules
- XPath operators and functions
- Boolean blind injection
- Error-based injection

### Protocol Attacks (920xxx) - 10 rules
- Request smuggling patterns
- HTTP method override
- Control characters

### Scanner Detection (913xxx) - 12 rules
- SQLMap, Nikto, Nessus, Acunetix
- Burp Suite, Nmap, DirBuster
- WPScan, Metasploit, Hydra

## Rule Management

### Disable Specific Rules

```json
{
  "rules": {
    "disabled": ["942100", "941110"]
  }
}
```

### Disable by Pattern

```json
{
  "rules": {
    "disabled": ["942*"]
  }
}
```

### Exclusions by Path

```json
{
  "rules": {
    "exclusions": [
      {
        "rules": ["942*"],
        "conditions": { "paths": ["/api/search", "/graphql"] }
      }
    ]
  }
}
```

### Exclusions by Tag

```json
{
  "rules": {
    "exclusions": [
      {
        "rules": ["@sqli-union"],
        "conditions": { "paths": ["/reports"] }
      }
    ]
  }
}
```

## Response Headers

| Header | Description |
|--------|-------------|
| `X-WAF-Blocked` | `true` if request was blocked |
| `X-WAF-Rule` | Rule ID that triggered block |
| `X-WAF-Score` | Total anomaly score |
| `X-WAF-Detected` | Rule IDs detected (below block threshold) |
| `X-WAF-Response-Detected` | Detections in response body |

## Test Payloads

### SQL Injection Test

```bash
curl -i "http://localhost:8080/api/users?id=1' OR '1'='1"
```

### XSS Test

```bash
curl -i "http://localhost:8080/search?q=<script>alert(1)</script>"
```

### SSTI Test

```bash
curl -i "http://localhost:8080/render?template={{7*7}}"
```

### Expected Response (Blocked)

```http
HTTP/1.1 403 Forbidden
X-WAF-Blocked: true
X-WAF-Rule: 942100
X-WAF-Score: 27
```

## Comparison with ModSecurity Agent

| Feature | WAF | ModSecurity |
|---------|-----|-------------|
| Detection Rules | 200+ rules | 800+ CRS rules |
| Anomaly Scoring | Yes | Yes |
| SecLang Support | No | Yes |
| Custom Rules | Via config | Full SecLang |
| Dependencies | Pure Rust | libmodsecurity (C) |
| Binary Size | ~5MB | ~50MB |
| Memory Usage | Low | Higher |
| Installation | `cargo install` | Requires libmodsecurity |

**Use WAF when:**
- You want zero-dependency deployment
- You need low latency and minimal resources
- Anomaly scoring with 200+ rules is sufficient
- You prefer configuration-based rule management

**Use [ModSecurity](/agents/modsec/) when:**
- You need full OWASP CRS compatibility
- You have existing ModSecurity/SecLang rules
- You require 800+ rules with full SecLang syntax

## False Positive Handling

1. **Anomaly scoring** - Single low-confidence matches won't block
2. **Lower paranoia level** - Start with level 1, increase gradually
3. **Exclude paths** - Skip known-safe endpoints
4. **Disable rules** - Turn off specific problematic rules
5. **Adjust thresholds** - Increase `block-threshold` if needed
6. **Detect-only mode** - Monitor before enabling blocking

## Related Agents

| Agent | Integration |
|-------|-------------|
| **ModSecurity** | Full OWASP CRS with 800+ rules |
| **AI Gateway** | AI-specific security controls |
| **Auth** | Combine with authentication |

> **Note:** For rate limiting, use [Sentinel's built-in rate limiting](/configuration/limits/) instead of an agent.
