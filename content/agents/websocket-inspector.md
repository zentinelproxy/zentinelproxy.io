+++
title = "WebSocket Inspector"
description = "Deep inspection and filtering of WebSocket connections with frame-level analysis and bidirectional message control."
template = "agent.html"

[taxonomies]
tags = ["websocket", "security", "real-time", "inspection"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Planned"
version = ""
license = "Apache-2.0"
repo = ""
homepage = "https://sentinel.raskell.io/agents/websocket-inspector/"
protocol_version = "0.1"

# Installation methods
crate_name = ""
docker_image = ""

# Compatibility
min_sentinel_version = ""
+++

## Overview

WebSocket Inspector provides deep packet inspection for WebSocket connections, enabling security policies, message filtering, and real-time monitoring of bidirectional communication channels.

## Planned Features

- **Frame-Level Inspection**: Analyze individual WebSocket frames (text, binary, control)
- **Bidirectional Filtering**: Apply policies to both client→server and server→client messages
- **Protocol Validation**: Enforce message schemas (JSON Schema, Protobuf, MessagePack)
- **Rate Limiting**: Per-connection and per-message rate controls
- **Connection Lifecycle**: Monitor handshake, messages, ping/pong, and close events
- **Payload Scanning**: Detect malicious content in WebSocket messages

## Use Cases

- **Chat Moderation**: Filter inappropriate content in real-time messaging apps
- **Gaming Security**: Detect cheating or protocol manipulation in multiplayer games
- **Trading Platforms**: Audit and validate financial data streams
- **IoT Security**: Monitor and filter device communication
- **API Gateway**: Apply security policies to WebSocket-based APIs

## Inspection Points

| Event | Description |
|-------|-------------|
| `ws_handshake` | Initial HTTP upgrade request |
| `ws_open` | Connection established |
| `ws_message` | Text or binary frame received |
| `ws_ping` / `ws_pong` | Keep-alive frames |
| `ws_close` | Connection termination |

## Architecture

```
Client ←→ Sentinel ←→ WebSocket Inspector ←→ Backend
              ↓                  ↓
         Frame Relay      Message Analysis
                               ↓
                    Filter / Modify / Block
```

## Configuration (Preview)

```kdl
agent "websocket-inspector" {
    type "websocket_inspector"
    transport "unix_socket" {
        path "/var/run/sentinel/ws-inspector.sock"
    }
    events ["ws_handshake" "ws_message" "ws_close"]
    timeout-ms 50
    failure-mode "open"

    // Message validation
    validation {
        schema-type "json"
        schema-path "/etc/sentinel/ws-schema.json"
        reject-invalid true
    }

    // Rate limiting per connection
    rate-limit {
        messages-per-second 100
        burst 200
    }

    // Content filtering
    content-filter {
        block-patterns ["/exec\\(/" "/eval\\(/"]
        max-message-size 65536
    }
}
```

## Status

This agent is currently in the planning phase. Follow the [GitHub repository](https://github.com/raskell-io/sentinel) for updates.
