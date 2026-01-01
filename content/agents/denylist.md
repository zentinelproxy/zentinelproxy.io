+++
title = "Denylist"
description = "Block requests based on IP addresses, CIDR ranges, or custom patterns with real-time updates."
template = "agent.html"

[taxonomies]
tags = ["security", "filtering", "core"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.1.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-denylist"
homepage = "https://sentinel.raskell.io/agents/denylist/"
protocol_version = "0.1"

# Installation methods
crate_name = "sentinel-agent-denylist"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Overview

The Denylist agent provides real-time request blocking based on IP addresses, CIDR ranges, user agents, or custom request attributes. Essential for blocking known malicious actors and implementing access control policies.

## Features

- **IP Blocking**: Block individual IPs or CIDR ranges
- **Pattern Matching**: Block based on headers, paths, or query parameters
- **Hot Reload**: Update deny rules without restarting
- **Metrics**: Track blocked requests per rule

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-denylist
```

### Using Docker

```bash
docker pull ghcr.io/raskell-io/sentinel-agent-denylist:latest
```

### Docker Compose

```yaml
services:
  denylist-agent:
    image: ghcr.io/raskell-io/sentinel-agent-denylist:latest
    volumes:
      - /var/run/sentinel:/var/run/sentinel
      - ./denylist.txt:/etc/sentinel/denylist.txt:ro
    environment:
      - SOCKET_PATH=/var/run/sentinel/denylist.sock
```

## Configuration

Add the agent to your Sentinel configuration:

```kdl
agent "denylist" {
    socket "/var/run/sentinel/denylist.sock"
    timeout 50ms
    fail-open false

    config {
        file "/etc/sentinel/denylist.txt"
        reload-interval 60s
    }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `file` | string | - | Path to denylist file |
| `reload-interval` | duration | `60s` | How often to check for file changes |
| `block-response-code` | integer | `403` | HTTP status code for blocked requests |

### Denylist File Format

```text
# IP addresses
192.168.1.100
10.0.0.50

# CIDR ranges
172.16.0.0/16

# Comments start with #
# Blank lines are ignored
```

## Response

When a request is blocked:

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json
X-Blocked-By: denylist

{"error": "access_denied", "reason": "ip_blocked"}
```

## Test Payloads

### Test IP Blocking

```bash
# Add an IP to denylist
echo "127.0.0.1" >> /etc/sentinel/denylist.txt

# Test (should be blocked)
curl -i http://localhost:8080/api/test
```

### Expected Response

```http
HTTP/1.1 403 Forbidden
X-Blocked-By: denylist
Content-Type: application/json

{"error": "access_denied", "reason": "ip_blocked"}
```

## Examples

### Basic IP Denylist

```kdl
agent "denylist" {
    socket "/var/run/sentinel/denylist.sock"

    config {
        file "/etc/sentinel/blocked-ips.txt"
        block-response-code 403
    }
}
```

### With Custom Response

```kdl
agent "denylist" {
    socket "/var/run/sentinel/denylist.sock"

    config {
        file "/etc/sentinel/denylist.txt"
        block-response-code 451
        block-message "Access restricted in your region"
    }
}
```
