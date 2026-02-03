+++
title = "Lua Scripting"
weight = 50
description = "Embed custom Lua scripts for flexible request/response processing and header manipulation."
template = "agent.html"

[taxonomies]
tags = ["scripting", "extensibility", "core"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-lua"
homepage = "https://sentinel.raskell.io/agents/lua/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-lua"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Protocol v2 Features

As of v0.2.0, the Lua agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status with draining awareness
- **Metrics export**: Counter metrics for requests processed/blocked and script errors
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling
- **Dual transport**: Supports both UDS and gRPC simultaneously

## Overview

The Lua Scripting agent enables custom request/response processing using embedded Lua scripts. Use it for header manipulation, custom routing logic, access control, and request/response transformation.

## Features

- **Embedded Lua Runtime**: Uses mlua (Lua 5.4) for script execution
- **Request/Response Hooks**: Inspect and modify at both request and response phases
- **Header Manipulation**: Add, remove, or modify request and response headers
- **Decision Control**: Allow, block, deny, or redirect requests
- **Audit Tags**: Add custom tags for logging and analytics
- **Fail-Open Mode**: Optionally allow requests when scripts error

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install lua

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### Using Cargo

```bash
cargo install sentinel-agent-lua
```

## Quick Start

```bash
# Create a simple script
cat > policy.lua << 'EOF'
function on_request_headers()
    -- Block requests to /admin from non-internal IPs
    if request.uri:match("^/admin") and not request.client_ip:match("^10%.") then
        return {
            decision = "block",
            status = 403,
            body = "Access denied"
        }
    end

    -- Add processing header
    return {
        decision = "allow",
        add_request_headers = {
            ["X-Processed-By"] = "lua-agent"
        }
    }
end
EOF

# Run the agent
sentinel-lua-agent --script policy.lua --socket /tmp/sentinel-lua.sock
```

## CLI Options

| Option | Env Var | Default | Description |
|--------|---------|---------|-------------|
| `--socket` | `AGENT_SOCKET` | `/tmp/sentinel-lua.sock` | Unix socket path |
| `--grpc-address` | `GRPC_ADDRESS` | - | gRPC listen address (e.g., `0.0.0.0:50051`) |
| `--script` | `LUA_SCRIPT` | (required) | Path to Lua script file |
| `--verbose` | `LUA_VERBOSE` | `false` | Enable debug logging |
| `--fail-open` | `FAIL_OPEN` | `false` | Allow requests on script errors |

## Lua API

### Request Object (on_request_headers)

The `request` global table is available in the `on_request_headers` function:

```lua
request.method         -- HTTP method: "GET", "POST", etc.
request.uri            -- Full URI with query string: "/api/users?page=1"
request.client_ip      -- Client IP address: "192.168.1.100"
request.correlation_id -- Request tracking ID
request.headers        -- Table of headers (values joined with ", " if multiple)
```

### Response Object (on_response_headers)

The `response` global table is available in the `on_response_headers` function:

```lua
response.status         -- HTTP status code: 200, 404, etc.
response.correlation_id -- Request tracking ID (same as request)
response.headers        -- Table of response headers
```

### Return Value

Both hook functions return a table with the following fields:

```lua
return {
    decision = "allow",  -- "allow", "block", "deny", or "redirect"

    -- For block/deny (optional)
    status = 403,        -- HTTP status code (default: 403)
    body = "Forbidden",  -- Response body

    -- For redirect (required)
    body = "https://example.com/login",  -- Redirect URL
    status = 302,        -- Redirect status (default: 302)

    -- Header modifications (optional)
    add_request_headers = {
        ["X-Custom"] = "value"
    },
    remove_request_headers = {"Cookie", "Authorization"},
    add_response_headers = {
        ["X-Frame-Options"] = "DENY"
    },
    remove_response_headers = {"Server"},

    -- Audit metadata (optional)
    tags = {"custom-rule", "blocked"}
}
```

### Decision Types

| Decision | Description |
|----------|-------------|
| `"allow"` | Allow request to proceed (default) |
| `"block"` | Block request with status code and body |
| `"deny"` | Alias for block |
| `"redirect"` | Redirect to URL specified in `body` field |
| `"challenge"` | Issue a challenge (CAPTCHA, JS challenge, proof-of-work) |

### Challenge Decision

```lua
return {
    decision = "challenge",
    challenge_type = "captcha",          -- "captcha", "js_challenge", "proof_of_work"
    challenge_params = {
        site_key = "your-captcha-site-key",
        action = "login"
    },
    tags = {"bot-challenge"}
}
```

### Extended Audit Metadata

For detailed audit logging, include rule IDs, confidence scores, and reason codes:

```lua
return {
    decision = "block",
    status = 403,
    tags = {"path-traversal"},
    rule_ids = {"SEC-001", "OWASP-930"},
    confidence = 0.95,
    reason_codes = {"PATH_TRAVERSAL_DETECTED"}
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tags` | table | Freeform tags for categorization |
| `rule_ids` | table | Specific rule identifiers that triggered |
| `confidence` | number | Confidence score (0.0 to 1.0) |
| `reason_codes` | table | Structured reason codes |

### Routing Metadata

Control upstream selection dynamically:

```lua
function on_request_headers()
    -- Route to different backends based on request
    if request.uri:match("^/api/v2") then
        return {
            decision = "allow",
            routing_metadata = {
                upstream = "api-v2-backend",
                priority = "high"
            }
        }
    end

    -- A/B testing: route 10% to canary
    if math.random() < 0.1 then
        return {
            decision = "allow",
            routing_metadata = {
                upstream = "canary-backend"
            },
            tags = {"canary"}
        }
    end

    return {decision = "allow"}
end
```

### Body Hooks

For body inspection, additional hooks are available:

| Hook | Description |
|------|-------------|
| `on_request_headers()` | Called when request headers are received |
| `on_request_body()` | Called when request body is available |
| `on_response_headers()` | Called when response headers are received |
| `on_response_body()` | Called when response body is available |

> **Note:** Body hooks require `events ["request_headers" "request_body_chunk" "response_headers" "response_body_chunk"]` in the Sentinel configuration.

### Body Mutation

Modify request or response bodies:

```lua
function on_request_body()
    -- Pass through unchanged
    return {
        decision = "allow",
        request_body_mutation = {
            action = "pass_through",
            chunk_index = 0
        }
    }
end

function on_response_body()
    -- Replace response body content
    return {
        decision = "allow",
        response_body_mutation = {
            action = "replace",
            chunk_index = 0,
            data = "Modified response content"
        }
    }
end
```

| Action | Description |
|--------|-------------|
| `pass_through` | Pass the chunk unchanged |
| `replace` | Replace chunk with `data` field content |
| `drop` | Drop the chunk entirely |

### Needs More Data

Signal that you need the request body before making a decision:

```lua
function on_request_headers()
    -- For POST requests, wait for body before deciding
    if request.method == "POST" and request.uri:match("^/api/") then
        return {
            decision = "allow",
            needs_more = true  -- Wait for body
        }
    end
    return {decision = "allow"}
end

function on_request_body()
    -- Now inspect the body
    local body = request.body or ""

    if body:match("malicious_pattern") then
        return {
            decision = "block",
            status = 403,
            body = "Request blocked"
        }
    end

    return {decision = "allow"}
end
```

## Examples

### Block by IP Range

```lua
function on_request_headers()
    -- Block requests from specific IP ranges
    local blocked_ranges = {"192.168.1.", "10.0.0."}

    for _, range in ipairs(blocked_ranges) do
        if request.client_ip:match("^" .. range:gsub("%.", "%%.")) then
            return {
                decision = "block",
                status = 403,
                body = "IP blocked",
                tags = {"ip-blocked"}
            }
        end
    end

    return {decision = "allow"}
end
```

### Add Security Headers

```lua
function on_request_headers()
    return {
        decision = "allow",
        add_response_headers = {
            ["X-Content-Type-Options"] = "nosniff",
            ["X-Frame-Options"] = "DENY",
            ["X-XSS-Protection"] = "1; mode=block",
            ["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        }
    }
end
```

### Path-Based Routing

```lua
function on_request_headers()
    -- Route API versions to different upstreams
    if request.uri:match("^/api/v2") then
        return {
            decision = "allow",
            add_request_headers = {
                ["X-Upstream"] = "api-v2-backend"
            }
        }
    elseif request.uri:match("^/api/v1") then
        return {
            decision = "allow",
            add_request_headers = {
                ["X-Upstream"] = "api-v1-backend"
            }
        }
    end

    return {decision = "allow"}
end
```

### Authentication Check

```lua
function on_request_headers()
    -- Require auth for protected paths
    local protected_paths = {"/admin", "/api/internal", "/dashboard"}

    for _, path in ipairs(protected_paths) do
        if request.uri:match("^" .. path) then
            local auth = request.headers["Authorization"]
            if not auth or auth == "" then
                return {
                    decision = "redirect",
                    body = "/login?next=" .. request.uri,
                    status = 302
                }
            end
        end
    end

    return {decision = "allow"}
end
```

### Response Header Modification

```lua
function on_response_headers()
    -- Remove server information headers
    return {
        decision = "allow",
        remove_response_headers = {"Server", "X-Powered-By"},
        add_response_headers = {
            ["X-Response-Time"] = os.time()
        }
    }
end
```

### Method Filtering

```lua
function on_request_headers()
    -- Only allow GET and POST for most endpoints
    local allowed_methods = {GET = true, POST = true, HEAD = true, OPTIONS = true}

    if not allowed_methods[request.method] then
        -- Allow PUT/DELETE only for /api paths
        if not request.uri:match("^/api/") then
            return {
                decision = "block",
                status = 405,
                body = "Method not allowed",
                add_response_headers = {
                    ["Allow"] = "GET, POST, HEAD, OPTIONS"
                }
            }
        end
    end

    return {decision = "allow"}
end
```

### Bot Protection with Challenge

```lua
function on_request_headers()
    local ua = request.headers["User-Agent"] or ""
    local suspicious_bots = {"curl", "wget", "python", "scrapy", "bot"}

    -- No User-Agent - issue JS challenge
    if ua == "" then
        return {
            decision = "challenge",
            challenge_type = "js_challenge",
            tags = {"no-user-agent"}
        }
    end

    -- Check for suspicious patterns
    local ua_lower = ua:lower()
    for _, bot in ipairs(suspicious_bots) do
        if ua_lower:match(bot) then
            return {
                decision = "challenge",
                challenge_type = "captcha",
                challenge_params = {
                    site_key = "your-captcha-site-key"
                },
                tags = {"suspicious-ua", bot}
            }
        end
    end

    return {decision = "allow"}
end
```

## Error Handling

When a script encounters an error:

- **fail-open disabled** (default): Request is blocked with HTTP 500 and audit tags `["lua", "error"]`
- **fail-open enabled**: Request is allowed with audit tags `["lua", "error", "fail_open"]`

The error message is included in the `reason_codes` audit field.

## Sentinel Integration

```kdl
agent "lua" {
    socket "/tmp/sentinel-lua.sock"
    timeout 50ms
    events ["request_headers" "response_headers"]
    failure-mode open
}

route {
    match { path-prefix "/" }
    agents ["lua"]
    upstream "backend"
}
```

## Comparison with JavaScript Agent

| Feature | Lua Agent | JavaScript Agent |
|---------|-----------|------------------|
| Runtime | mlua (Lua 5.4) | QuickJS (ES2020) |
| Syntax | Lua | JavaScript |
| Performance | Fast startup | Fast startup |
| Use case | Simple scripts | Complex logic |
| String handling | Pattern matching | Full regex |

## Related Agents

| Agent | Integration |
|-------|-------------|
| **JavaScript** | Alternative scripting with full regex |
| **WebAssembly** | High-performance custom logic |
| **WAF** | Combine with security rules |
