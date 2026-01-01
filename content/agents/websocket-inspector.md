+++
title = "WebSocket Inspector"
description = "Deep inspection and filtering of WebSocket connections with content detection, schema validation, and rate limiting."
template = "agent.html"

[taxonomies]
tags = ["websocket", "security", "real-time", "inspection"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Beta"
version = "0.1.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-websocket-inspector"
homepage = "https://sentinel.raskell.io/agents/websocket-inspector/"
protocol_version = "0.1"

# Installation methods
crate_name = "sentinel-agent-websocket-inspector"
docker_image = ""

# Compatibility
min_sentinel_version = "0.1.0"
+++

## Overview

WebSocket Inspector provides security controls for WebSocket connections, enabling content filtering, schema validation, rate limiting, and size limits for bidirectional real-time communication.

## Features

### Content Filtering

Detect and block malicious payloads in WebSocket messages:

- **XSS Detection**: Script tags, event handlers, javascript: URIs
- **SQL Injection**: UNION SELECT, tautologies, time-based injection
- **Command Injection**: Shell chaining, backticks, $() substitution
- **Custom Patterns**: User-defined regex patterns

### Schema Validation

Validate message structure:

- **JSON Schema**: Validate text frames against JSON Schema
- **MessagePack**: Decode and validate binary MessagePack messages

### Rate Limiting

Per-connection rate controls:

- Messages per second
- Bytes per second
- Configurable burst allowance

### Size Limits

Prevent resource exhaustion:

- Maximum text frame size
- Maximum binary frame size
- Maximum total message size

## Use Cases

- **Chat Moderation**: Filter XSS and injection attacks in real-time messaging
- **Gaming Security**: Detect protocol manipulation in multiplayer games
- **Trading Platforms**: Validate message schemas for financial data streams
- **IoT Security**: Rate limit and filter device communication
- **API Gateway**: Apply security policies to WebSocket-based APIs

## Quick Start

```bash
# Install
cargo install sentinel-agent-websocket-inspector

# Run with defaults (XSS, SQLi, command injection detection enabled)
sentinel-ws-agent --socket /tmp/sentinel-ws.sock

# With rate limiting
sentinel-ws-agent \
  --max-messages-per-sec 100 \
  --max-bytes-per-sec 1048576

# With JSON Schema validation
sentinel-ws-agent --json-schema /path/to/schema.json
```

## Configuration Options

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-ws.sock` |
| `--xss-detection` | `WS_XSS` | Enable XSS detection | `true` |
| `--sqli-detection` | `WS_SQLI` | Enable SQLi detection | `true` |
| `--command-injection` | `WS_CMD` | Enable command injection detection | `true` |
| `--custom-patterns` | `WS_PATTERNS` | Comma-separated regex patterns | - |
| `--json-schema` | `WS_JSON_SCHEMA` | Path to JSON Schema file | - |
| `--msgpack-validation` | `WS_MSGPACK` | Enable MessagePack validation | `false` |
| `--max-messages-per-sec` | `WS_RATE_MESSAGES` | Rate limit (messages/sec) | `0` (unlimited) |
| `--max-bytes-per-sec` | `WS_RATE_BYTES` | Rate limit (bytes/sec) | `0` (unlimited) |
| `--rate-limit-burst` | `WS_RATE_BURST` | Burst allowance | `10` |
| `--max-text-frame-size` | `WS_MAX_TEXT` | Max text frame size | `0` (unlimited) |
| `--max-binary-frame-size` | `WS_MAX_BINARY` | Max binary frame size | `0` (unlimited) |
| `--block-mode` | `WS_BLOCK_MODE` | Block or detect-only | `true` |
| `--fail-open` | `WS_FAIL_OPEN` | Allow on errors | `false` |
| `--log-frames` | `WS_LOG_FRAMES` | Log all frames | `false` |
| `--inspect-binary` | `WS_INSPECT_BINARY` | Inspect binary frames | `false` |

## Detection Patterns

### XSS Patterns
- `<script>`, `</script>` - Script tags
- `on*=` - Event handlers (onclick, onerror, etc.)
- `javascript:` - JavaScript URIs
- `<iframe>`, `<object>`, `<embed>` - Embedded content

### SQL Injection Patterns
- `UNION SELECT` - Union-based injection
- `OR 1=1`, `' OR '` - Tautology attacks
- `SLEEP()`, `WAITFOR DELAY` - Time-based injection
- `INFORMATION_SCHEMA` - Schema enumeration

### Command Injection Patterns
- `; cmd`, `| cmd` - Command chaining
- `` `cmd` ``, `$(cmd)` - Command substitution
- `/bin/sh -i` - Reverse shell patterns

## WebSocket Close Codes

When blocking, the agent uses RFC 6455 close codes:

| Code | Meaning | Use Case |
|------|---------|----------|
| 1008 | Policy Violation | Security violation, rate limit exceeded |
| 1009 | Message Too Big | Frame exceeds size limit |

## Audit Tags

Detections are logged with audit tags for analysis:

- `ws-xss` - XSS detection
- `ws-sqli` - SQL injection detection
- `ws-cmd-injection` - Command injection detection
- `ws-custom-pattern` - Custom pattern match
- `ws-schema-invalid` - Schema validation failure
- `ws-size-limit` - Size limit exceeded
- `ws-rate-limit` - Rate limit exceeded
- `detect-only` - Detection without blocking

## Sentinel Integration

Configure the agent in your Sentinel proxy:

```kdl
agent "websocket-inspector" {
    type "websocket_inspector"
    transport "unix_socket" {
        path "/tmp/sentinel-ws.sock"
    }
    events ["websocket_frame"]
    timeout-ms 50
    failure-mode "open"
}
```

## Example: Chat Application

```bash
# Protect a real-time chat with content filtering and rate limiting
sentinel-ws-agent \
  --socket /tmp/chat-ws.sock \
  --xss-detection true \
  --sqli-detection true \
  --max-messages-per-sec 10 \
  --rate-limit-burst 20 \
  --max-text-frame-size 4096
```

## Example: Schema-Validated API

```bash
# Validate all messages against a JSON Schema
sentinel-ws-agent \
  --socket /tmp/api-ws.sock \
  --json-schema /etc/sentinel/ws-api-schema.json \
  --block-mode true
```

## Architecture

```
Client ←→ Sentinel ←→ WebSocket Inspector ←→ Backend
              ↓                  ↓
         Frame Relay      Content Analysis
                               ↓
                    Filter / Validate / Block
```
