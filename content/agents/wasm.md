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
license = "MIT"
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
