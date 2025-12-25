+++
title = "Lua Scripting"
description = "Embed custom Lua scripts for flexible request/response processing and business logic."
template = "agent.html"

[taxonomies]
tags = ["scripting", "extensibility", "core"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Beta"
version = "0.1.0"
license = "MIT"
repo = "https://github.com/raskell-io/sentinel-agent-lua"
homepage = "https://sentinel.raskell.io/agents/lua/"
protocol_version = "0.1"

# Installation methods
crate_name = "sentinel-agent-lua"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Overview

The Lua Scripting agent enables custom request/response processing using embedded Lua scripts. Perfect for business logic, custom routing, header manipulation, and integration with external systems.

## Features

- **Embedded Lua 5.4**: Full Lua runtime with LuaJIT performance
- **Request/Response Access**: Read and modify headers, body, metadata
- **Hot Reload**: Update scripts without restart
- **Sandboxed Execution**: Safe, isolated script environment
- **HTTP Client**: Make external API calls from scripts

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-lua
```

### Using Docker

```bash
docker pull ghcr.io/raskell-io/sentinel-agent-lua:latest
```

### Docker Compose

```yaml
services:
  lua-agent:
    image: ghcr.io/raskell-io/sentinel-agent-lua:latest
    volumes:
      - /var/run/sentinel:/var/run/sentinel
      - ./scripts:/etc/sentinel/lua:ro
    environment:
      - SOCKET_PATH=/var/run/sentinel/lua.sock
```

## Configuration

Add the agent to your Sentinel configuration:

```kdl
agent "lua" {
    socket "/var/run/sentinel/lua.sock"
    timeout 100ms
    fail-open true

    config {
        scripts-dir "/etc/sentinel/lua"
        reload-interval 30s

        // Global variables available to scripts
        globals {
            "API_VERSION" "v1"
            "ENVIRONMENT" "production"
        }
    }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `scripts-dir` | string | - | Directory containing Lua scripts |
| `reload-interval` | duration | `30s` | Script reload check interval |
| `max-execution-time` | duration | `50ms` | Maximum script execution time |
| `memory-limit` | string | `"10MB"` | Maximum memory per script |

## Lua API

### Request Object

```lua
-- Access request properties
local method = request.method        -- "GET", "POST", etc.
local path = request.path            -- "/api/users"
local query = request.query          -- table of query params
local headers = request.headers      -- table of headers
local body = request.body            -- request body (string)

-- Modify request
request:set_header("X-Custom", "value")
request:remove_header("Cookie")
request:set_path("/v2" .. request.path)
```

### Response Object

```lua
-- Access response (in response phase)
local status = response.status
local headers = response.headers
local body = response.body

-- Modify response
response:set_header("X-Processed-By", "lua")
response:set_status(200)
response:set_body('{"modified": true}')
```

### Available Functions

```lua
-- Logging
log.info("Processing request")
log.warn("Rate limit approaching")
log.error("Failed to process")

-- JSON handling
local data = json.decode(request.body)
local str = json.encode({status = "ok"})

-- HTTP client (async)
local resp = http.get("https://api.example.com/check")
local resp = http.post("https://api.example.com/log", {
    headers = {["Content-Type"] = "application/json"},
    body = json.encode({event = "request"})
})

-- Key-value store (shared across requests)
kv.set("user:123:count", 5, 3600)  -- key, value, ttl
local count = kv.get("user:123:count")
kv.incr("user:123:count")
```

## Script Structure

Create scripts in the configured directory:

```lua
-- /etc/sentinel/lua/custom_routing.lua

function on_request(request)
    -- Add request ID
    request:set_header("X-Request-Id", generate_uuid())

    -- Custom routing based on header
    local tenant = request.headers["X-Tenant-Id"]
    if tenant == "premium" then
        request:set_header("X-Upstream", "premium-backend")
    end

    return "continue"  -- or "block", "redirect"
end

function on_response(request, response)
    -- Add timing header
    response:set_header("X-Process-Time", tostring(request.start_time))

    return "continue"
end
```

## Test Payloads

### Basic Script Test

```bash
# Create test script
cat > /etc/sentinel/lua/test.lua << 'EOF'
function on_request(request)
    request:set_header("X-Lua-Processed", "true")
    return "continue"
end
EOF

# Test
curl -i http://localhost:8080/api/test
```

### Expected Response

```http
HTTP/1.1 200 OK
X-Lua-Processed: true
...
```

## Examples

### A/B Testing

```lua
-- /etc/sentinel/lua/ab_test.lua

function on_request(request)
    local user_id = request.headers["X-User-Id"] or "anonymous"

    -- Deterministic bucketing based on user ID
    local hash = string.byte(user_id, 1) or 0
    local variant = (hash % 100 < 50) and "A" or "B"

    request:set_header("X-AB-Variant", variant)

    if variant == "B" then
        request:set_header("X-Upstream", "new-backend")
    end

    return "continue"
end
```

### Request Enrichment

```lua
-- /etc/sentinel/lua/enrich.lua

function on_request(request)
    -- Look up user from cache or external service
    local user_id = request.headers["X-User-Id"]
    if user_id then
        local cached = kv.get("user:" .. user_id)
        if not cached then
            local resp = http.get("https://api.internal/users/" .. user_id)
            if resp.status == 200 then
                cached = resp.body
                kv.set("user:" .. user_id, cached, 300)
            end
        end

        if cached then
            local user = json.decode(cached)
            request:set_header("X-User-Org", user.org_id)
            request:set_header("X-User-Role", user.role)
        end
    end

    return "continue"
end
```

### Custom Rate Limiting

```lua
-- /etc/sentinel/lua/custom_ratelimit.lua

function on_request(request)
    local key = request.headers["X-API-Key"] or request.client_ip

    -- Get current count
    local count = kv.get("rate:" .. key) or 0

    -- Check limit
    if count >= 100 then
        return "block", {
            status = 429,
            body = json.encode({error = "rate_limit_exceeded"})
        }
    end

    -- Increment
    kv.incr("rate:" .. key)
    if count == 0 then
        kv.expire("rate:" .. key, 60)
    end

    request:set_header("X-RateLimit-Remaining", tostring(100 - count - 1))
    return "continue"
end
```
