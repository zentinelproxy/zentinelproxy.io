+++
title = "MQTT Gateway"
weight = 80
description = "IoT protocol security for MQTT: topic-based ACLs, client authentication, payload inspection, rate limiting, and QoS enforcement."
template = "agent.html"

[taxonomies]
tags = ["mqtt", "iot", "security", "authentication", "acl", "rate-limiting"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-mqtt-gateway"
homepage = "https://sentinel.raskell.io/agents/mqtt-gateway/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-mqtt-gateway"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Protocol v2 Features

As of v0.2.0, the MQTT Gateway agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status with broker connectivity awareness
- **Metrics export**: Counter metrics for packets processed/blocked/authenticated
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

MQTT Gateway provides **comprehensive security controls** for MQTT traffic in IoT environments. The agent processes MQTT packets transmitted over WebSocket, enabling topic-based access control, client authentication, payload inspection, and rate limiting.

<div class="info-notice">

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Topic-Based ACLs** | Allow/deny publish/subscribe based on topic patterns with `+` and `#` wildcards |
| **Client Authentication** | Username/password, JWT tokens, client certificates |
| **Payload Inspection** | SQLi, command injection, XSS detection + JSON schema validation |
| **Rate Limiting** | Per-client and per-topic message rate limits |
| **QoS Enforcement** | Maximum QoS levels with automatic downgrade |
| **Retained Message Control** | Allow/deny retained flag per topic |

</div>

## How It Works

MQTT Gateway operates on MQTT packets transported via WebSocket. Sentinel's native WebSocket support handles frame parsing, and this agent inspects the MQTT protocol content within binary frames:

```
MQTT Client ←→ Sentinel ←→ MQTT Gateway Agent ←→ MQTT Broker
     │              │               │
  WebSocket    Frame Routing   MQTT Parsing
     │              │          ACL Check
     │              │          Auth Check
     │              │          Rate Limit
     │              └── Decision ─┘
                       (allow/drop/close)
```

## Features

### Topic-Based Access Control

Control publish and subscribe access with flexible topic patterns:

```json
{
  "acl": {
    "enabled": true,
    "default-action": "deny",
    "rules": [
      {
        "name": "sensor-publish",
        "match": { "username-regex": "^sensor-" },
        "topics": ["sensors/+/data", "sensors/+/status"],
        "actions": ["publish"],
        "decision": "allow",
        "max-qos": 1
      },
      {
        "name": "admin-full-access",
        "match": { "groups": ["admin"] },
        "topics": ["#"],
        "actions": ["publish", "subscribe"],
        "decision": "allow"
      },
      {
        "name": "block-internal",
        "topics": ["$SYS/#", "internal/#"],
        "decision": "deny",
        "priority": 100
      }
    ]
  }
}
```

#### Topic Wildcards

MQTT topic patterns support standard wildcards:
- `+` - Matches exactly one level (`sensors/+/data` matches `sensors/temp/data`)
- `#` - Matches zero or more levels (`sensors/#` matches `sensors/temp/living/zone1`)

#### Match Conditions

Rules can match on multiple criteria:
- `username` / `username-regex` - Exact or regex match on MQTT username
- `client-id` / `client-id-regex` - Match on MQTT client ID
- `client-ip` - IP address or CIDR range (e.g., `192.168.1.0/24`)
- `groups` - User must belong to any listed group
- `protocol-version` - MQTT protocol version (3, 4, or 5)

### Client Authentication

Multiple authentication providers evaluated in order:

```json
{
  "auth": {
    "enabled": true,
    "allow-anonymous": false,
    "providers": [
      {
        "type": "file",
        "path": "/etc/sentinel/mqtt-users.json"
      },
      {
        "type": "jwt",
        "issuer": "https://auth.example.com",
        "secret": "${JWT_SECRET}",
        "username-claim": "sub"
      }
    ],
    "client-id-pattern": "^[a-zA-Z0-9_-]{5,64}$"
  }
}
```

#### File-Based Authentication

Users file format (bcrypt hashed passwords):

```json
{
  "users": {
    "sensor-001": {
      "password_hash": "$2b$12$...",
      "groups": ["sensors", "zone-a"],
      "enabled": true
    },
    "admin": {
      "password_hash": "$2b$12$...",
      "groups": ["admin"],
      "enabled": true
    }
  }
}
```

#### JWT Authentication

JWT tokens are passed in the MQTT password field:
- Validates signature, expiration, issuer, audience
- Extracts username from configurable claim
- Supports HMAC (HS256) with static secret

### Payload Inspection

Detect malicious content in MQTT message payloads:

```json
{
  "inspection": {
    "enabled": true,
    "max-payload-size": 262144,
    "patterns": {
      "sqli": true,
      "command-injection": true,
      "script-injection": true,
      "path-traversal": true,
      "custom-patterns": [
        {
          "name": "api-key-leak",
          "pattern": "(?i)api[_-]?key\\s*[=:]",
          "severity": "high"
        }
      ]
    },
    "json-schema": {
      "schema-file": "/etc/sentinel/sensor-schema.json",
      "topics": ["sensors/+/data"],
      "block-on-failure": true
    },
    "exclude-topics": ["logs/#", "debug/#"]
  }
}
```

### Rate Limiting

Token bucket rate limiting at multiple levels:

```json
{
  "rate-limit": {
    "enabled": true,
    "per-client": {
      "messages-per-second": 100,
      "bytes-per-second": 1048576,
      "burst": 50
    },
    "per-topic": [
      {
        "topic": "high-freq/#",
        "limit": {
          "messages-per-second": 1000,
          "burst": 100
        }
      },
      {
        "topic": "low-freq/#",
        "limit": {
          "messages-per-second": 10,
          "burst": 5
        }
      }
    ],
    "key-by": "client_id"
  }
}
```

Rate limit keys:
- `client_id` - Per MQTT client ID
- `username` - Per authenticated username
- `client_ip` - Per client IP address

### QoS Enforcement

Control maximum QoS levels:

```json
{
  "qos": {
    "enabled": true,
    "max-qos": 1,
    "downgrade": true,
    "per-topic": [
      {
        "topic": "realtime/#",
        "max-qos": 0
      },
      {
        "topic": "reliable/#",
        "max-qos": 2
      }
    ]
  }
}
```

When `downgrade` is enabled, QoS is silently reduced to the maximum allowed. When disabled, the message is dropped.

### Retained Message Control

Control which topics can use retained messages:

```json
{
  "retained": {
    "enabled": true,
    "allow-retained": false,
    "allowed-topics": ["config/#", "status/#"],
    "blocked-topics": ["sensors/#"],
    "max-size": 65536
  }
}
```

## Use Cases

- **IoT Device Management**: Secure device-to-cloud communication with per-device ACLs
- **MQTT Broker Protection**: Add security layer in front of Mosquitto, EMQX, or HiveMQ
- **Industrial IoT (IIoT)**: Protect SCADA and manufacturing systems
- **Smart Buildings**: Secure building automation and sensor networks
- **Fleet Management**: Control vehicle telemetry access

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install mqtt-gateway

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### Using Cargo

```bash
cargo install sentinel-agent-mqtt-gateway
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-mqtt-gateway
cd sentinel-agent-mqtt-gateway
cargo build --release
```

## Quick Start

```bash
# Run with defaults
sentinel-mqtt-agent --socket /tmp/sentinel-mqtt.sock

# With configuration file
sentinel-mqtt-agent \
  --socket /tmp/sentinel-mqtt.sock \
  --config /etc/sentinel/mqtt-gateway.json

# With JSON logging
sentinel-mqtt-agent \
  --socket /tmp/sentinel-mqtt.sock \
  --json-logs \
  --log-level debug
```

## CLI Options

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-mqtt-agent.sock` |
| `--grpc-address` | `AGENT_GRPC_ADDRESS` | gRPC listen address (e.g., `0.0.0.0:50051`) | - |
| `--config` | `MQTT_CONFIG` | Configuration file path | - |
| `--log-level` | `MQTT_LOG_LEVEL` | Log level (trace, debug, info, warn, error) | `info` |
| `--json-logs` | - | Enable JSON log format | `false` |

## Sentinel Configuration

Enable WebSocket support and attach the MQTT Gateway agent:

```kdl
agent "mqtt-gateway" {
    socket "/tmp/sentinel-mqtt.sock"
    timeout 100ms
    events ["websocket_frame"]
    failure-mode closed

    config {
        auth {
            enabled true
            allow-anonymous false
        }
        acl {
            enabled true
            default-action "deny"
        }
    }
}

route {
    match { path-prefix "/mqtt" }
    websocket enabled {
        max-frame-size 65536
    }
    agents ["mqtt-gateway"]
    upstream "mqtt-broker"
}
```

## Full Configuration Example

```json
{
  "auth": {
    "enabled": true,
    "allow-anonymous": false,
    "providers": [
      {
        "type": "file",
        "path": "/etc/sentinel/mqtt-users.json"
      }
    ],
    "min-client-id-length": 5,
    "max-client-id-length": 64
  },
  "acl": {
    "enabled": true,
    "default-action": "deny",
    "rules": [
      {
        "name": "sensors-publish",
        "match": { "username-regex": "^sensor-" },
        "topics": ["sensors/+/data"],
        "actions": ["publish"],
        "decision": "allow",
        "max-qos": 1
      },
      {
        "name": "operators-subscribe",
        "match": { "groups": ["operators"] },
        "topics": ["sensors/#"],
        "actions": ["subscribe"],
        "decision": "allow"
      }
    ]
  },
  "inspection": {
    "enabled": true,
    "max-payload-size": 262144,
    "patterns": {
      "sqli": true,
      "command-injection": true
    }
  },
  "rate-limit": {
    "enabled": true,
    "per-client": {
      "messages-per-second": 100,
      "bytes-per-second": 1048576,
      "burst": 50
    }
  },
  "qos": {
    "enabled": true,
    "max-qos": 1,
    "downgrade": true
  },
  "retained": {
    "enabled": true,
    "allow-retained": false,
    "allowed-topics": ["config/#"]
  },
  "general": {
    "block-mode": true,
    "fail-open": false,
    "log-packets": false,
    "protocol-versions": ["3.1.1", "5.0"]
  }
}
```

## MQTT Packet Handling

The agent processes these MQTT control packets:

| Packet | Checks Applied |
|--------|----------------|
| **CONNECT** | Authentication, client ID validation |
| **PUBLISH** | ACL, rate limit, QoS, retained, payload inspection |
| **SUBSCRIBE** | ACL per topic filter |
| **UNSUBSCRIBE** | ACL (optional) |
| **PINGREQ/PINGRESP** | Allowed (keep-alive) |
| **DISCONNECT** | Cleanup connection state |

## Decisions and Actions

| Decision | WebSocket Action | Use Case |
|----------|------------------|----------|
| **Allow** | Forward frame | Request passes all checks |
| **Drop** | Drop frame silently | Policy violation, rate limit |
| **Close** | Close connection (code 1008) | Auth failure, protocol error |

## Audit Tags

All decisions include audit metadata for logging and analysis:

- `mqtt`, `connect`, `success` - Successful connection
- `mqtt`, `blocked`, `auth-failed` - Authentication failure
- `mqtt`, `blocked`, `acl-denied` - ACL rejection
- `mqtt`, `blocked`, `rate-limited` - Rate limit exceeded
- `mqtt`, `blocked`, `inspection-blocked` - Malicious payload detected
- `mqtt`, `detect-only` - Detection without blocking (when block-mode is false)

## Related Agents

| Agent | Integration |
|-------|-------------|
| **WebSocket Inspector** | Generic WebSocket frame security |
| **Auth** | HTTP-level authentication for WebSocket upgrade |
| **Rate Limit** | HTTP-level rate limiting |
| **WAF** | HTTP request/response protection |
