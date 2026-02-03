+++
title = "WebSocket Inspector"
weight = 70
description = "Security analysis for WebSocket frames: content filtering, schema validation, and attack detection for real-time connections."
template = "agent.html"

[taxonomies]
tags = ["websocket", "security", "real-time", "inspection"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-websocket-inspector"
homepage = "https://sentinel.raskell.io/agents/websocket-inspector/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-websocket-inspector"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Protocol v2 Features

As of v0.2.0, the WebSocket Inspector agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status for monitoring
- **Metrics export**: Counter metrics for frames processed/blocked/dropped
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

WebSocket Inspector provides **content-level security analysis** for WebSocket connections. This agent processes individual frames sent by Sentinel's native WebSocket support, enabling deep inspection of real-time bidirectional traffic.

<div class="info-notice">

### How It Works with Sentinel

Sentinel v26.01 includes [native WebSocket support](/features/#websocket) that handles:
- RFC 6455 compliant connection upgrades
- Frame parsing and encoding
- Frame masking/unmasking
- Connection management

When you enable WebSocket inspection, Sentinel routes each frame to this agent for security analysis:

```
Client ←→ Sentinel ←→ WebSocket Inspector ←→ Backend
              │                │
       Frame Routing    Content Analysis
              │                │
              └── Decision ────┘
                  (allow/block)
```

| Feature | Built-in | Agent |
|---------|----------|-------|
| HTTP 101 Upgrade handling | Yes | — |
| Frame parsing/encoding | Yes | — |
| Frame masking/unmasking | Yes | — |
| Max frame size limits | Yes | — |
| Per-route WebSocket enable | Yes | — |
| **XSS detection in frames** | — | Yes |
| **SQL injection detection** | — | Yes |
| **Command injection detection** | — | Yes |
| **JSON Schema validation** | — | Yes |
| **Per-connection rate limiting** | — | Yes |
| **Custom pattern matching** | — | Yes |

</div>

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

### Per-Connection Rate Limiting

Prevent abuse on individual connections:

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

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install websocket-inspector

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### Using Cargo

```bash
cargo install sentinel-agent-websocket-inspector
```

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
| `--grpc-address` | `AGENT_GRPC_ADDRESS` | gRPC listen address (e.g., `0.0.0.0:50051`) | - |
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

## Sentinel Configuration

Enable WebSocket support on a route and attach the inspector agent:

```kdl
agent "websocket-inspector" {
    socket "/tmp/sentinel-ws.sock"
    timeout 50ms
    events ["websocket_frame"]
    failure-mode open
}

route {
    match { path-prefix "/ws" }
    websocket enabled {
        max-frame-size 65536
    }
    agents ["websocket-inspector"]
    upstream "backend"
}
```

### Frame Inspection Events

When `events ["websocket_frame"]` is configured, Sentinel sends each frame to the agent with:

```json
{
    "event_type": "websocket_frame",
    "correlation_id": "conn-123",
    "frame": {
        "opcode": "text",
        "payload": "Hello, world!",
        "direction": "client_to_server"
    }
}
```

The agent responds with a decision:

```json
{
    "decision": "allow"
}
```

Or to block:

```json
{
    "decision": "block",
    "websocket_close_code": 1008,
    "websocket_close_reason": "Policy violation: XSS detected"
}
```

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

## Example: Chat Application

```kdl
agent "websocket-inspector" {
    socket "/tmp/chat-ws.sock"
    timeout 50ms
    events ["websocket_frame"]
}

route {
    match { path-prefix "/chat" }
    websocket enabled {
        max-frame-size 4096
    }
    agents ["websocket-inspector"]
    upstream "chat-backend"
}
```

Run the agent with chat-specific settings:

```bash
sentinel-ws-agent \
  --socket /tmp/chat-ws.sock \
  --xss-detection true \
  --sqli-detection true \
  --max-messages-per-sec 10 \
  --rate-limit-burst 20 \
  --max-text-frame-size 4096
```

## Example: Schema-Validated API

For WebSocket APIs with strict message formats:

```bash
sentinel-ws-agent \
  --socket /tmp/api-ws.sock \
  --json-schema /etc/sentinel/ws-api-schema.json \
  --block-mode true
```

Example JSON Schema for a trading API:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["action", "symbol"],
  "properties": {
    "action": { "enum": ["subscribe", "unsubscribe", "order"] },
    "symbol": { "type": "string", "pattern": "^[A-Z]{1,5}$" },
    "quantity": { "type": "integer", "minimum": 1 }
  }
}
```

## Related Agents

| Agent | Integration |
|-------|-------------|
| **WAF** | HTTP request/response protection |
| **Auth** | Authenticate WebSocket upgrade requests |
