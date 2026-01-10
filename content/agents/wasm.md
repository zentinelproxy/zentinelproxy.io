+++
title = "WebAssembly"
description = "Execute custom Wasm modules for high-performance request/response processing in any language."
template = "agent.html"

[taxonomies]
tags = ["scripting", "wasm", "extensibility", "performance"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Beta"
version = "0.1.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-wasm"
homepage = "https://sentinel.raskell.io/agents/wasm/"
protocol_version = "0.1"

# Installation methods
crate_name = "sentinel-agent-wasm"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Overview

WebAssembly agent for Sentinel reverse proxy. Execute custom Wasm modules for high-performance request/response processing. Write modules in Rust, Go, C, AssemblyScript, or any language that compiles to WebAssembly.

## Features

- **Language-Agnostic**: Write modules in Rust, Go, C, AssemblyScript, etc.
- **High Performance**: Fast wasmtime runtime with instance pooling
- **Strong Isolation**: Secure Wasm sandboxing
- **JSON Data Exchange**: Simple JSON-based communication
- **Header Manipulation**: Add/remove headers on requests and responses
- **Audit Tags**: Add tags for logging and analytics
- **Fail-Open Mode**: Graceful error handling

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-wasm
```

## Configuration

### Command Line

```bash
sentinel-wasm-agent --socket /var/run/sentinel/wasm.sock \
  --module /etc/sentinel/modules/security.wasm
```

### Environment Variables

| Option | Env Var | Description | Default |
|--------|---------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-wasm.sock` |
| `--module` | `WASM_MODULE` | Wasm module file (.wasm) | (required) |
| `--pool-size` | `WASM_POOL_SIZE` | Instance pool size | `4` |
| `--verbose` | `WASM_VERBOSE` | Enable debug logging | `false` |
| `--fail-open` | `FAIL_OPEN` | Allow requests on module errors | `false` |

### Sentinel Configuration

```kdl
agent "wasm" {
    socket "/var/run/sentinel/wasm.sock"
    timeout 50ms
    events ["request_headers" "response_headers"]
}

route {
    match { path-prefix "/" }
    agents ["wasm"]
    upstream "backend"
}
```

## Writing Wasm Modules

### Required ABI

Modules must export these functions:

```text
// Memory allocation (required)
alloc(size: i32) -> i32          // Allocate bytes, return pointer
dealloc(ptr: i32, size: i32)     // Free memory

// Request/Response handlers (at least one required)
on_request_headers(ptr: i32, len: i32) -> i64
on_response_headers(ptr: i32, len: i32) -> i64
```

### Request Object (Input JSON)

```json
{
    "method": "GET",
    "uri": "/api/users?page=1",
    "client_ip": "192.168.1.100",
    "correlation_id": "abc123",
    "headers": {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0..."
    }
}
```

### Result Object (Output JSON)

```json
{
    "decision": "allow",
    "status": 403,
    "body": "Forbidden",
    "add_request_headers": {"X-Processed": "true"},
    "remove_request_headers": ["X-Debug"],
    "add_response_headers": {"X-Frame-Options": "DENY"},
    "tags": ["processed"]
}
```

### Decision Values

| Decision | Description |
|----------|-------------|
| `allow` | Allow the request/response |
| `block` | Block with status (default: 403) and body |
| `deny` | Same as block |
| `redirect` | Redirect to URL in `body` field |
| `challenge` | Issue a challenge (CAPTCHA, JS challenge, proof-of-work) |

### Challenge Decision

```json
{
    "decision": "challenge",
    "challenge_type": "captcha",
    "challenge_params": {
        "site_key": "your-captcha-site-key",
        "action": "login"
    },
    "tags": ["bot-challenge"]
}
```

### Extended Audit Metadata

For detailed audit logging, include rule IDs, confidence scores, and reason codes:

```json
{
    "decision": "block",
    "status": 403,
    "tags": ["path-traversal"],
    "rule_ids": ["SEC-001", "OWASP-930"],
    "confidence": 0.95,
    "reason_codes": ["PATH_TRAVERSAL_DETECTED"]
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

```json
{
    "decision": "allow",
    "routing_metadata": {
        "upstream": "api-v2-backend",
        "priority": "high"
    }
}
```

### Body Hooks

For body inspection, additional handler functions are available:

| Hook | Description |
|------|-------------|
| `on_request_headers(ptr, len) -> i64` | Called when request headers are received |
| `on_request_body(ptr, len) -> i64` | Called when request body is available |
| `on_response_headers(ptr, len) -> i64` | Called when response headers are received |
| `on_response_body(ptr, len) -> i64` | Called when response body is available |

> **Note:** Body hooks require `events ["request_headers" "request_body_chunk" "response_headers" "response_body_chunk"]` in the Sentinel configuration.

### Body Mutation

Modify request or response bodies:

```json
{
    "decision": "allow",
    "request_body_mutation": {
        "action": "pass_through",
        "chunk_index": 0
    }
}
```

```json
{
    "decision": "allow",
    "response_body_mutation": {
        "action": "replace",
        "chunk_index": 0,
        "data": "Modified response content"
    }
}
```

| Action | Description |
|--------|-------------|
| `pass_through` | Pass the chunk unchanged |
| `replace` | Replace chunk with `data` field content |
| `drop` | Drop the chunk entirely |

### Needs More Data

Signal that you need the request body before making a decision:

```json
{
    "decision": "allow",
    "needs_more": true
}
```

Return this from `on_request_headers` to receive the body in `on_request_body` before the final decision.

## Rust Module Example

```rust
use serde::{Deserialize, Serialize};
use std::alloc::{alloc as heap_alloc, dealloc as heap_dealloc, Layout};

#[derive(Deserialize)]
struct Request {
    method: String,
    uri: String,
    client_ip: String,
    headers: std::collections::HashMap<String, String>,
}

#[derive(Serialize, Default)]
struct Result {
    decision: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<String>,
}

#[no_mangle]
pub extern "C" fn alloc(size: i32) -> i32 {
    let layout = Layout::from_size_align(size as usize, 1).unwrap();
    unsafe { heap_alloc(layout) as i32 }
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: i32, size: i32) {
    let layout = Layout::from_size_align(size as usize, 1).unwrap();
    unsafe { heap_dealloc(ptr as *mut u8, layout) }
}

#[no_mangle]
pub extern "C" fn on_request_headers(ptr: i32, len: i32) -> i64 {
    let input = unsafe {
        let slice = std::slice::from_raw_parts(ptr as *const u8, len as usize);
        std::str::from_utf8(slice).unwrap()
    };

    let request: Request = serde_json::from_str(input).unwrap();

    let result = if request.uri.contains("/admin") {
        Result {
            decision: "block".to_string(),
            status: Some(403),
            body: Some("Forbidden".to_string()),
        }
    } else {
        Result {
            decision: "allow".to_string(),
            ..Default::default()
        }
    };

    let output = serde_json::to_string(&result).unwrap();
    let bytes = output.as_bytes();
    let len = bytes.len() as i32;
    let ptr = alloc(len);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr as *mut u8, bytes.len());
    }
    ((ptr as i64) << 32) | (len as i64)
}
```

### Build Module

```bash
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
```

## Bot Protection Example (Rust)

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Deserialize)]
struct Request {
    uri: String,
    headers: HashMap<String, String>,
}

#[derive(Serialize, Default)]
struct Result {
    decision: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    challenge_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    challenge_params: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
}

#[no_mangle]
pub extern "C" fn on_request_headers(ptr: i32, len: i32) -> i64 {
    let input = unsafe {
        let slice = std::slice::from_raw_parts(ptr as *const u8, len as usize);
        std::str::from_utf8(slice).unwrap()
    };

    let request: Request = serde_json::from_str(input).unwrap();
    let ua = request.headers.get("User-Agent").map(|s| s.as_str()).unwrap_or("");

    let result = if ua.is_empty() {
        // No User-Agent - issue JS challenge
        Result {
            decision: "challenge".to_string(),
            challenge_type: Some("js_challenge".to_string()),
            tags: vec!["no-user-agent".to_string()],
            ..Default::default()
        }
    } else if ua.to_lowercase().contains("bot") || ua.to_lowercase().contains("curl") {
        // Suspicious UA - issue CAPTCHA
        let mut params = HashMap::new();
        params.insert("site_key".to_string(), "your-captcha-site-key".to_string());

        Result {
            decision: "challenge".to_string(),
            challenge_type: Some("captcha".to_string()),
            challenge_params: Some(params),
            tags: vec!["suspicious-ua".to_string()],
        }
    } else {
        Result {
            decision: "allow".to_string(),
            ..Default::default()
        }
    };

    // ... encode and return result
    let output = serde_json::to_string(&result).unwrap();
    let bytes = output.as_bytes();
    let len = bytes.len() as i32;
    let ptr = alloc(len);
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), ptr as *mut u8, bytes.len());
    }
    ((ptr as i64) << 32) | (len as i64)
}
```

## Instance Pooling

Configure pool size based on workload:

| Pool Size | Use Case |
|-----------|----------|
| 1 | Minimum memory, sequential processing |
| 4 (default) | Good balance for most workloads |
| 8+ | High-concurrency scenarios |

## Error Handling

| Mode | On Error |
|------|----------|
| `--fail-open` enabled | Log error, allow request, add `wasm-error` and `fail-open` tags |
| `--fail-open` disabled | Log error, block with 500 status, add `wasm-error` tag |

## Comparison with Other Scripting Agents

| Feature | WebAssembly | JavaScript | Lua |
|---------|-------------|------------|-----|
| Language | Any (Rust, Go, C) | JavaScript | Lua |
| Runtime | wasmtime | QuickJS | mlua |
| Performance | Fastest | Fast | Fast |
| Sandboxing | Strong (Wasm) | Basic | Basic |
| Complexity | Higher | Lower | Lower |
| Use Case | Max performance | Full regex | Simple scripts |

**Use WebAssembly when:**
- Maximum performance requirements
- Existing Rust/Go/C code to port
- Strong isolation between modules
- Memory-safe execution

**Use [JavaScript](/agents/js/) or [Lua](/agents/lua/) when:**
- Simpler scripting needs
- Rapid prototyping
- No compilation step desired

## Related Agents

| Agent | Integration |
|-------|-------------|
| **JavaScript** | Simpler scripting with full regex |
| **Lua** | Simple scripting with Lua syntax |
| **WAF** | Combine with security rules |
