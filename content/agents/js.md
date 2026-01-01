+++
title = "JavaScript Scripting"
description = "Write custom request/response processing logic in JavaScript using the QuickJS engine."
template = "agent.html"

[taxonomies]
tags = ["scripting", "javascript", "extensibility"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Beta"
version = "0.1.0"
license = "MIT"
repo = "https://github.com/raskell-io/sentinel-agent-js"
homepage = "https://sentinel.raskell.io/agents/js/"
protocol_version = "0.1"

# Installation methods
crate_name = "sentinel-agent-js"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Overview

JavaScript scripting agent for Sentinel reverse proxy. Write custom request/response processing logic in JavaScript using the fast, lightweight QuickJS engine.

## Features

- **QuickJS Engine**: Fast, embedded JavaScript runtime
- **Request/Response Hooks**: Process requests and responses
- **Header Manipulation**: Add/remove headers on requests and responses
- **Return-Based Decisions**: Allow, block, or redirect requests
- **Console API**: Logging with console.log, console.warn, console.error
- **Fail-Open Mode**: Graceful error handling
- **Audit Tags**: Add tags for logging and analytics

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-js
```

## Configuration

### Command Line

```bash
sentinel-js-agent --socket /var/run/sentinel/js.sock \
  --script /etc/sentinel/scripts/handler.js
```

### Environment Variables

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-js.sock` |
| `--script` | `JS_SCRIPT` | JavaScript script file | (required) |
| `--verbose` | `JS_VERBOSE` | Enable debug logging | `false` |
| `--fail-open` | `FAIL_OPEN` | Allow requests on script errors | `false` |

### Sentinel Configuration

```kdl
agent "js" {
    socket "/var/run/sentinel/js.sock"
    timeout 100ms
    events ["request_headers" "response_headers"]
}

route {
    match { path-prefix "/" }
    agents ["js"]
    upstream "backend"
}
```

## Writing Scripts

### Basic Example

```javascript
function on_request_headers(request) {
    // Block admin access
    if (request.uri.includes("/admin")) {
        return { decision: "block", status: 403, body: "Forbidden" };
    }

    // Allow all other requests
    return { decision: "allow" };
}
```

### Available Hooks

| Hook | Description |
|------|-------------|
| `on_request_headers(request)` | Called when request headers are received |
| `on_response_headers(response)` | Called when response headers are received |

### Request Object

```javascript
{
    method: "GET",              // HTTP method
    uri: "/api/users?page=1",   // Request URI with query string
    client_ip: "192.168.1.1",   // Client IP address
    correlation_id: "abc123",   // Request correlation ID
    headers: {                  // Request headers
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0..."
    }
}
```

### Return Values

```javascript
// Allow the request
return { decision: "allow" };

// Block with custom status and body
return { decision: "block", status: 403, body: "Access Denied" };

// Deny is an alias for block
return { decision: "deny", status: 403, body: "Access Denied" };

// Redirect to another URL
return { decision: "redirect", status: 302, body: "https://example.com/login" };
```

### Header Manipulation

```javascript
function on_request_headers(request) {
    return {
        decision: "allow",
        add_request_headers: {
            "X-Processed-By": "js-agent",
            "X-Client-IP": request.client_ip
        },
        remove_request_headers: ["X-Debug"],
        add_response_headers: {
            "X-Frame-Options": "DENY"
        }
    };
}
```

### Audit Tags

```javascript
function on_request_headers(request) {
    if (request.headers["User-Agent"]?.includes("bot")) {
        return {
            decision: "allow",
            tags: ["bot-detected", "monitoring"]
        };
    }
    return { decision: "allow" };
}
```

## Examples

### Block Bad User-Agents

```javascript
function on_request_headers(request) {
    const ua = request.headers["User-Agent"] || "";
    const badBots = ["sqlmap", "nikto", "nessus", "masscan"];

    for (const bot of badBots) {
        if (ua.toLowerCase().includes(bot)) {
            return {
                decision: "block",
                status: 403,
                tags: ["bot-blocked", bot]
            };
        }
    }
    return { decision: "allow" };
}
```

### Require Authentication

```javascript
function on_request_headers(request) {
    // Skip for public paths
    if (request.uri.startsWith("/public/") || request.uri === "/health") {
        return { decision: "allow" };
    }

    // Check for auth header
    if (!request.headers["Authorization"]) {
        return {
            decision: "block",
            status: 401,
            body: "Authentication required"
        };
    }

    return { decision: "allow" };
}
```

### Add Security Headers

```javascript
function on_response_headers(response) {
    return {
        decision: "allow",
        add_response_headers: {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-XSS-Protection": "1; mode=block",
            "Strict-Transport-Security": "max-age=31536000"
        }
    };
}
```

### Rate Limit Tiers

```javascript
function on_request_headers(request) {
    let tier = "standard";
    if (request.uri.startsWith("/api/v1/")) {
        tier = "api";
    } else if (request.uri.startsWith("/admin/")) {
        tier = "admin";
    }

    return {
        decision: "allow",
        add_request_headers: {
            "X-Rate-Limit-Tier": tier
        }
    };
}
```

## Error Handling

| Mode | On Error |
|------|----------|
| `--fail-open` enabled | Log error, allow request, add `js-error` and `fail-open` tags |
| `--fail-open` disabled | Log error, block with 500 status, add `js-error` tag |

## Comparison with Lua Agent

| Feature | JavaScript | Lua |
|---------|------------|-----|
| Engine | QuickJS (ES2020) | mlua (Lua 5.4) |
| Scripting | Single script file | Single script file |
| String handling | Full regex | Pattern matching |
| Standard Library | console.log/warn/error | None |
| Use Case | Complex logic, regex | Simple scripts |

**Use JavaScript when:**
- You need full regular expression support
- Familiar with JavaScript syntax
- Complex string manipulation

**Use [Lua agent](/agents/lua/) when:**
- Familiar with Lua syntax
- Simple pattern matching is sufficient
- Prefer Lua's concise table syntax

## Related Agents

| Agent | Integration |
|-------|-------------|
| **Lua** | More powerful scripting alternative |
| **WebAssembly** | High-performance custom logic |
| **WAF** | Combine with security rules |
