+++
title = "JavaScript Scripting"
weight = 230
description = "Write custom request/response processing logic in JavaScript using the QuickJS engine."
template = "agent.html"

[taxonomies]
tags = ["scripting", "javascript", "extensibility"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-js"
homepage = "https://sentinel.raskell.io/agents/js/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-js"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Protocol v2 Features

As of v0.2.0, the JavaScript agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status with draining awareness
- **Metrics export**: Counter metrics for requests processed/blocked and script errors
- **gRPC transport**: High-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

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

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install js

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

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
| `--grpc-address` | `AGENT_GRPC_ADDRESS` | gRPC listen address (e.g., `0.0.0.0:50052`) | - |
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
| `on_request_body(request)` | Called when request body is available |
| `on_response_headers(response)` | Called when response headers are received |
| `on_response_body(response)` | Called when response body is available |

> **Note:** Body hooks require `events ["request_headers" "request_body_chunk" "response_headers" "response_body_chunk"]` in the Sentinel configuration.

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

// Challenge the client (CAPTCHA, JS challenge, etc.)
return {
    decision: "challenge",
    challenge_type: "captcha",
    challenge_params: {
        site_key: "your-captcha-site-key",
        action: "login"
    }
};
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

### Extended Audit Metadata

For detailed audit logging, you can include rule IDs, confidence scores, and reason codes:

```javascript
function on_request_headers(request) {
    if (request.uri.includes("..")) {
        return {
            decision: "block",
            status: 403,
            tags: ["path-traversal"],
            rule_ids: ["SEC-001", "OWASP-930"],
            confidence: 0.95,
            reason_codes: ["PATH_TRAVERSAL_DETECTED"]
        };
    }
    return { decision: "allow" };
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tags` | array | Freeform tags for categorization |
| `rule_ids` | array | Specific rule identifiers that triggered |
| `confidence` | number | Confidence score (0.0 to 1.0) |
| `reason_codes` | array | Structured reason codes |

### Routing Metadata

Control upstream selection dynamically:

```javascript
function on_request_headers(request) {
    // Route to different backends based on request
    if (request.uri.startsWith("/api/v2")) {
        return {
            decision: "allow",
            routing_metadata: {
                upstream: "api-v2-backend",
                priority: "high"
            }
        };
    }

    // A/B testing: route 10% to canary
    if (Math.random() < 0.1) {
        return {
            decision: "allow",
            routing_metadata: {
                upstream: "canary-backend"
            },
            tags: ["canary"]
        };
    }

    return { decision: "allow" };
}
```

### Body Mutation

Modify request or response bodies:

```javascript
function on_request_body(request) {
    // Pass through unchanged
    return {
        decision: "allow",
        request_body_mutation: {
            action: "pass_through",
            chunk_index: 0
        }
    };
}

function on_response_body(response) {
    // Replace response body content
    return {
        decision: "allow",
        response_body_mutation: {
            action: "replace",
            chunk_index: 0,
            data: "Modified response content"
        }
    };
}
```

| Action | Description |
|--------|-------------|
| `pass_through` | Pass the chunk unchanged |
| `replace` | Replace chunk with `data` field content |
| `drop` | Drop the chunk entirely |

### Needs More Data

Signal that you need the request body before making a decision:

```javascript
function on_request_headers(request) {
    // For POST requests, wait for body before deciding
    if (request.method === "POST" && request.uri.startsWith("/api/")) {
        return {
            decision: "allow",
            needs_more: true  // Wait for body
        };
    }
    return { decision: "allow" };
}

function on_request_body(request) {
    // Now inspect the body
    const body = request.body || "";

    if (body.includes("malicious_pattern")) {
        return {
            decision: "block",
            status: 403,
            body: "Request blocked"
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

### Bot Protection with Challenge

```javascript
function on_request_headers(request) {
    const ua = request.headers["User-Agent"] || "";
    const suspiciousBots = ["curl", "wget", "python-requests", "scrapy"];

    // No User-Agent - issue JS challenge
    if (!ua) {
        return {
            decision: "challenge",
            challenge_type: "js_challenge",
            tags: ["no-user-agent"]
        };
    }

    // Suspicious User-Agent - issue CAPTCHA
    for (const bot of suspiciousBots) {
        if (ua.toLowerCase().includes(bot)) {
            return {
                decision: "challenge",
                challenge_type: "captcha",
                challenge_params: {
                    site_key: "your-captcha-site-key"
                },
                tags: ["suspicious-ua", bot]
            };
        }
    }

    return { decision: "allow" };
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
| **Lua** | Alternative scripting with Lua syntax |
| **WebAssembly** | High-performance custom logic |
| **WAF** | Combine with security rules |
