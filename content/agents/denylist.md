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
- **User-Agent Blocking**: Block known bad bots, scrapers, and scanners
- **Header Matching**: Block based on any request header value
- **Path Blocking**: Block requests to specific paths or path patterns
- **Query Parameter Blocking**: Block requests with specific query parameters
- **Regex Support**: Use regular expressions for flexible pattern matching
- **Hot Reload**: Update deny rules without restarting
- **Metrics**: Track blocked requests per rule
- **Audit Tags**: Add custom tags for logging and analytics

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
| `block-message` | string | `"Access denied"` | Response body for blocked requests |

### Command Line Options

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-denylist.sock` |
| `--file` | `DENYLIST_FILE` | Path to denylist file | (required) |
| `--reload-interval` | `RELOAD_INTERVAL` | Check interval for file changes | `60s` |
| `--block-code` | `BLOCK_CODE` | HTTP status for blocked requests | `403` |
| `--block-message` | `BLOCK_MESSAGE` | Response body message | `Access denied` |
| `--verbose`, `-v` | `VERBOSE` | Enable debug logging | `false` |

## Denylist File Format

The denylist file supports multiple rule types. Each rule is on its own line, with comments starting with `#`.

### IP Addresses and CIDR Ranges

```text
# Single IP addresses
192.168.1.100
10.0.0.50

# CIDR ranges
172.16.0.0/16
10.0.0.0/8

# IPv6
2001:db8::1
2001:db8::/32
```

### User-Agent Blocking

Block requests based on User-Agent header patterns:

```text
# Block specific user agents (exact match)
ua:sqlmap
ua:nikto
ua:nessus

# Block user agent patterns (regex)
ua:/(?i)bot|crawler|spider/
ua:/(?i)python-requests|curl|wget/
ua:/(?i)masscan|nmap|zgrab/
```

### Header Blocking

Block requests based on any header value:

```text
# Block specific header values (exact match)
header:X-Forwarded-For:192.168.1.100
header:X-API-Key:revoked-key-12345

# Block header patterns (regex)
header:Referer:/(?i)spam-domain\.com/
header:X-Custom:/malicious-pattern/

# Block if header is present (any value)
header:X-Debug-Mode:*
```

### Path Blocking

Block requests to specific paths:

```text
# Exact path match
path:/admin
path:/.env
path:/.git/config

# Path prefix
path:/api/internal/*
path:/debug/*

# Path patterns (regex)
path:/(?i)phpmyadmin/
path:/\.php$
path:/wp-(admin|login)/
```

### Query Parameter Blocking

Block requests with specific query parameters:

```text
# Block if parameter exists with any value
query:debug
query:admin_override

# Block specific parameter values
query:token:revoked-token-123
query:api_key:blocked-key

# Block parameter patterns (regex)
query:callback:/^javascript:/
query:redirect:/(?i)evil\.com/
```

### Combined Rules with Tags

Add audit tags for tracking and analytics:

```text
# Rules with custom tags
192.168.1.100 [tag:known-attacker]
ua:sqlmap [tag:scanner,tag:sqli-tool]
path:/admin [tag:admin-access]
header:X-Suspicious:* [tag:suspicious-header,tag:investigate]
```

### Rule Syntax Summary

| Type | Syntax | Example |
|------|--------|---------|
| IP | `<ip>` or `<cidr>` | `192.168.1.100`, `10.0.0.0/8` |
| User-Agent | `ua:<pattern>` | `ua:sqlmap`, `ua:/bot/` |
| Header | `header:<name>:<value>` | `header:X-Key:bad-key` |
| Path | `path:<pattern>` | `path:/admin`, `path:/\.env/` |
| Query | `query:<param>[:<value>]` | `query:debug`, `query:token:abc` |
| Regex | `/<pattern>/` | `/(?i)pattern/` |
| Tags | `[tag:<name>]` | `[tag:blocked]` |

## Response

When a request is blocked:

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json
X-Blocked-By: denylist
X-Blocked-Rule: ip
X-Blocked-Pattern: 192.168.1.100

{"error": "access_denied", "reason": "ip_blocked"}
```

### Response Headers

| Header | Description |
|--------|-------------|
| `X-Blocked-By` | Always `denylist` |
| `X-Blocked-Rule` | Rule type: `ip`, `ua`, `header`, `path`, `query` |
| `X-Blocked-Pattern` | The pattern that matched |

### Block Reasons by Rule Type

| Rule Type | Reason |
|-----------|--------|
| IP/CIDR | `ip_blocked` |
| User-Agent | `user_agent_blocked` |
| Header | `header_blocked` |
| Path | `path_blocked` |
| Query | `query_blocked` |

## Test Payloads

### Test IP Blocking

```bash
# Add an IP to denylist
echo "127.0.0.1" >> /etc/sentinel/denylist.txt

# Test (should be blocked)
curl -i http://localhost:8080/api/test
```

### Test User-Agent Blocking

```bash
# Add user agent rule
echo "ua:curl" >> /etc/sentinel/denylist.txt

# Test (should be blocked)
curl -i http://localhost:8080/api/test
```

Response:
```http
HTTP/1.1 403 Forbidden
X-Blocked-By: denylist
X-Blocked-Rule: ua
X-Blocked-Pattern: curl

{"error": "access_denied", "reason": "user_agent_blocked"}
```

### Test Path Blocking

```bash
# Add path rule
echo "path:/.env" >> /etc/sentinel/denylist.txt

# Test (should be blocked)
curl -i http://localhost:8080/.env
```

Response:
```http
HTTP/1.1 403 Forbidden
X-Blocked-By: denylist
X-Blocked-Rule: path
X-Blocked-Pattern: /.env

{"error": "access_denied", "reason": "path_blocked"}
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

**blocked-ips.txt:**
```text
# Known malicious IPs
192.168.1.100
10.0.0.50

# Entire subnet
172.16.0.0/16
```

### Block Security Scanners

Block known vulnerability scanners and penetration testing tools:

**scanners.txt:**
```text
# Security scanners
ua:sqlmap [tag:scanner]
ua:nikto [tag:scanner]
ua:nessus [tag:scanner]
ua:nmap [tag:scanner]
ua:masscan [tag:scanner]
ua:zgrab [tag:scanner]
ua:gobuster [tag:scanner]
ua:dirbuster [tag:scanner]

# Generic scanner patterns
ua:/(?i)scanner|exploit|attack/ [tag:scanner]
```

### Block Bad Bots and Scrapers

**bad-bots.txt:**
```text
# Known bad bots
ua:/(?i)ahrefsbot|semrushbot|dotbot/ [tag:seo-bot]
ua:/(?i)mj12bot|blexbot/ [tag:seo-bot]

# Generic bot patterns
ua:/(?i)bot|crawler|spider/ [tag:bot]

# Headless browsers (often used for scraping)
ua:/(?i)headless|phantomjs|selenium/ [tag:scraper]

# Empty user agent
ua: [tag:no-ua]
```

### Protect Sensitive Paths

**sensitive-paths.txt:**
```text
# Configuration files
path:/.env [tag:config-exposure]
path:/.git/* [tag:config-exposure]
path:/config.php [tag:config-exposure]
path:/wp-config.php [tag:config-exposure]

# Admin and debug paths
path:/admin [tag:admin-access]
path:/debug [tag:debug-access]
path:/actuator/* [tag:actuator-exposure]

# Backup files
path:/\.bak$/ [tag:backup-file]
path:/\.backup$/ [tag:backup-file]
path:/\.old$/ [tag:backup-file]

# PHP and ASP files (if not using those)
path:/\.php$/ [tag:unexpected-extension]
path:/\.asp$/ [tag:unexpected-extension]
```

### Block Suspicious Query Parameters

**query-blocks.txt:**
```text
# Debug/admin parameters
query:debug [tag:debug-param]
query:admin [tag:admin-param]
query:test [tag:test-param]

# Known attack patterns
query:callback:/^javascript:/ [tag:xss-attempt]
query:redirect:/(?i)(https?:)?\/\// [tag:open-redirect]
query:url:/(?i)(https?:)?\/\// [tag:ssrf-attempt]

# SQL injection indicators
query:id:/' OR / [tag:sqli-attempt]
query:id:/UNION SELECT/ [tag:sqli-attempt]
```

### Block Revoked API Keys

**revoked-keys.txt:**
```text
# Revoked API keys
header:X-API-Key:key_abc123_revoked [tag:revoked-key]
header:X-API-Key:key_def456_compromised [tag:revoked-key]
header:Authorization:Bearer tok_expired_xyz [tag:expired-token]

# Block specific origins
header:Origin:/(?i)malicious-site\.com/ [tag:blocked-origin]
```

### Comprehensive Security Denylist

Combine multiple rule types for comprehensive protection:

**security-denylist.txt:**
```text
# =====================
# IP Blocks
# =====================
# Known threat IPs (update regularly)
192.168.100.0/24 [tag:threat-intel]

# =====================
# Scanner Detection
# =====================
ua:sqlmap [tag:scanner,tag:high-risk]
ua:nikto [tag:scanner,tag:high-risk]
ua:/(?i)nmap|masscan|zgrab/ [tag:scanner]

# =====================
# Bot Management
# =====================
ua:/(?i)bot|crawler|spider/ [tag:bot]
ua: [tag:no-user-agent]

# =====================
# Path Protection
# =====================
path:/.env [tag:sensitive-file]
path:/.git/* [tag:sensitive-file]
path:/admin [tag:admin-path]
path:/\.php$/ [tag:blocked-extension]

# =====================
# Query Protection
# =====================
query:debug [tag:debug-param]
query:callback:/^javascript:/ [tag:xss]

# =====================
# Header Checks
# =====================
header:X-Debug:* [tag:debug-header]
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

## Related Agents

| Agent | Integration |
|-------|-------------|
| **Auth** | Block IPs before auth processing |
| **WAF** | Combine with attack detection |
| **ModSecurity** | Full WAF with IP reputation |

> **Note:** For country-level blocking, use [Sentinel's built-in GeoIP filtering](/configuration/geoip/) instead.
