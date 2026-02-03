+++
title = "Policy"
weight = 10
description = "Multi-language policy evaluation agent supporting Cedar and Rego/OPA for fine-grained authorization decisions."
template = "agent.html"

[taxonomies]
tags = ["security", "authorization", "policy", "cedar", "rego", "opa"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Beta"
version = "0.1.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-policy"
homepage = "https://sentinel.raskell.io/agents/policy/"
protocol_version = "v2"

# Installation methods
cabal_package = "sentinel-agent-policy"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Overview

The Policy agent provides flexible authorization decisions using multiple policy languages. It supports both **Cedar** (AWS's policy language) and **Rego** (Open Policy Agent's language), allowing you to choose the policy engine that best fits your needs or use both together.

Written in Haskell for correctness and reliability, this agent evaluates policies by shelling out to the `cedar` and `opa` CLI tools, making it easy to use existing policies and benefit from the official policy engine implementations.

## Features

### Policy Languages

- **Cedar**: AWS's policy language for fine-grained access control
  - Intuitive permit/forbid syntax
  - Entity-based authorization model
  - Principal, action, resource, and context evaluation

- **Rego/OPA**: Open Policy Agent's declarative policy language
  - General-purpose policy language
  - Rich built-in functions
  - Package-based policy organization

### Core Features

- **Multi-Engine Support**: Use Cedar, Rego, or both simultaneously
- **Auto-Detection**: Automatically detect policy language from file extension
- **Decision Caching**: LRU cache with configurable TTL for fast repeated decisions
- **Input Mapping**: Flexible mapping from HTTP requests to policy inputs
- **Audit Logging**: Track all authorization decisions

### Protocol v2

- **Unix Domain Socket**: High-performance UDS transport
- **Health Reporting**: Automatic health status reporting to proxy
- **Metrics Export**: Built-in metrics (evaluations, allows, denies, cache hits)
- **Graceful Lifecycle**: Proper startup and shutdown handling

## Requirements

This agent requires external CLI tools for policy evaluation:

- **For Cedar policies**: Install the [cedar CLI](https://github.com/cedar-policy/cedar)
- **For Rego policies**: Install the [opa CLI](https://www.openpolicyagent.org/docs/latest/#running-opa)

```bash
# Install Cedar CLI (via cargo)
cargo install cedar-policy-cli

# Install OPA CLI (via homebrew on macOS)
brew install opa

# Or download OPA binary directly
curl -L -o opa https://openpolicyagent.org/downloads/latest/opa_linux_amd64_static
chmod +x opa && sudo mv opa /usr/local/bin/
```

## Installation

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-policy
cd sentinel-agent-policy
cabal build
cabal install
```

### Using Cabal

```bash
cabal install sentinel-agent-policy
```

## Quick Start

### Command Line

```bash
# Start with Cedar policy
sentinel-policy-agent \
  --socket /var/run/sentinel/policy.sock \
  --engine cedar \
  --policy-file /etc/sentinel/policies/authz.cedar

# Start with Rego policy
sentinel-policy-agent \
  --socket /var/run/sentinel/policy.sock \
  --engine rego \
  --policy-file /etc/sentinel/policies/authz.rego

# Auto-detect engine from file extension
sentinel-policy-agent \
  --socket /var/run/sentinel/policy.sock \
  --engine auto \
  --policy-file /etc/sentinel/policies/authz.cedar
```

### Configuration File

Create a `policy.yaml` configuration file:

```yaml
engine: cedar  # or "rego" or "auto"
policies:
  - type: file
    path: /etc/sentinel/policies/authz.cedar
default_decision: deny
cache:
  enabled: true
  ttl_seconds: 60
  max_entries: 10000
socket_path: /var/run/sentinel/policy.sock
log_level: info
```

Then run:

```bash
sentinel-policy-agent --config policy.yaml
```

## Configuration

### Sentinel Proxy Configuration

```kdl
agents {
    agent "policy" {
        type "custom"
        transport "unix_socket" {
            path "/var/run/sentinel/policy.sock"
        }
        events ["request_headers"]
        timeout-ms 100
        failure-mode "closed"
        protocol-version 2
    }
}

routes {
    route "api" {
        matches { path-prefix "/api" }
        upstream "backend"
        agents ["policy"]
    }
}
```

### Command Line Options

| Option | Environment | Description | Default |
|--------|-------------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-policy.sock` |
| `--config` | `CONFIG_FILE` | Path to YAML config file | - |
| `--engine` | `POLICY_ENGINE` | Engine: `cedar`, `rego`, `auto` | `auto` |
| `--policy-file` | `POLICY_FILE` | Path to policy file | - |
| `--default-decision` | `DEFAULT_DECISION` | Default: `allow` or `deny` | `deny` |
| `--cache-enabled` | `CACHE_ENABLED` | Enable decision caching | `true` |
| `--cache-ttl` | `CACHE_TTL` | Cache TTL in seconds | `60` |
| `--log-level` | `LOG_LEVEL` | Log level: debug, info, warn, error | `info` |

### Configuration File Options

```yaml
# Policy engine: cedar, rego, or auto (detect from file extension)
engine: auto

# Socket path for Sentinel proxy connection
socket_path: /var/run/sentinel/policy.sock

# Policy sources
policies:
  - type: file
    path: /etc/sentinel/policies/authz.cedar
  - type: file
    path: /etc/sentinel/policies/rbac.rego
  - type: inline
    content: |
      permit(principal, action, resource)
      when { resource.path like "/public/*" };

# Default decision when no policy matches or on error
default_decision: deny

# Decision caching
cache:
  enabled: true
  ttl_seconds: 60
  max_entries: 10000

# Input mapping (how to extract principal/action/resource from requests)
input_mapping:
  principal:
    source: header
    name: X-User-Id
  action:
    get_maps_to: read
    post_maps_to: create
    put_maps_to: update
    patch_maps_to: update
    delete_maps_to: delete
    default: read
  resource:
    pattern: "/api/{resource_type}/{resource_id}"

# Logging
log_level: info

# Audit logging
audit:
  enabled: true
  log_allows: false
  log_denies: true
```

## Policy Examples

### Cedar Policy

```cedar
// Allow authenticated users to read any resource
permit(
    principal,
    action == Action::"read",
    resource
);

// Allow users to modify their own resources
permit(
    principal,
    action,
    resource
) when {
    resource.owner == principal
};

// Admins can do anything
permit(
    principal,
    action,
    resource
) when {
    principal.role == "admin"
};

// Deny access to admin paths for non-admins
forbid(
    principal,
    action,
    resource
) when {
    resource.path like "/admin/*" &&
    principal.role != "admin"
};
```

### Rego Policy

```rego
package sentinel.authz

import future.keywords.if
import future.keywords.in

default allow := false

# Allow authenticated users to read
allow if {
    input.action == "read"
    input.principal.id != "anonymous"
}

# Allow users to modify their own resources
allow if {
    input.resource.owner == input.principal.id
}

# Admins can do anything
allow if {
    "admin" in input.principal.roles
}

# Deny access to admin paths for non-admins
deny if {
    startswith(input.resource.path, "/admin/")
    not "admin" in input.principal.roles
}

# Final decision
decision := "allow" if {
    allow
    not deny
}

decision := "deny" if {
    not allow
}

decision := "deny" if {
    deny
}
```

## Input Format

The agent constructs a policy input from each HTTP request:

### Cedar Request Format

```json
{
  "principal": "User::\"user-123\"",
  "action": "Action::\"read\"",
  "resource": "Resource::\"/api/documents/456\"",
  "context": {
    "method": "GET",
    "path": "/api/documents/456",
    "headers": {
      "content-type": "application/json"
    }
  }
}
```

### Rego Input Format

```json
{
  "principal": {
    "id": "user-123",
    "type": "User",
    "attributes": {}
  },
  "action": "read",
  "method": "GET",
  "resource": {
    "id": "456",
    "type": "Document",
    "path": "/api/documents/456",
    "attributes": {}
  },
  "context": {
    "headers": {"content-type": "application/json"},
    "query": {}
  }
}
```

## Decision Caching

The agent caches policy decisions to improve performance for repeated requests:

- **Cache Key**: Hash of (principal, action, resource, relevant context)
- **TTL**: Configurable expiration time (default 60 seconds)
- **LRU Eviction**: Least-recently-used entries evicted when cache is full
- **Invalidation**: Cache clears on policy reload

```yaml
cache:
  enabled: true
  ttl_seconds: 60
  max_entries: 10000
```

## Metrics

The agent reports the following metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `policy_evaluations_total` | Counter | Total policy evaluations |
| `policy_allow_total` | Counter | Total allow decisions |
| `policy_deny_total` | Counter | Total deny decisions |
| `policy_cache_hits_total` | Counter | Cache hits |
| `policy_cache_misses_total` | Counter | Cache misses |
| `policy_errors_total` | Counter | Evaluation errors |
| `policy_in_flight` | Gauge | Current in-flight evaluations |
| `policy_cache_entries` | Gauge | Current cache size |

## Response Codes

| Status | Condition |
|--------|-----------|
| 403 | Policy denied the request |
| (passthrough) | Policy allowed the request |

On denial, the agent returns:
```
403 Forbidden
Access denied by policy
```

## Health Status

The agent reports health status including:

- Current load (in-flight requests)
- Average evaluation latency
- Error rate
- Cache statistics

Health degrades to "degraded" when:
- Error rate exceeds 10% of total evaluations
- In-flight requests exceed 80

## Comparison with Auth Agent

| Feature | Policy Agent | Auth Agent |
|---------|--------------|------------|
| Focus | Authorization only | AuthN + AuthZ |
| Cedar Support | Full | Basic (embedded) |
| Rego/OPA Support | Full | No |
| Authentication | No | JWT, OIDC, SAML, mTLS, API keys |
| Session Management | No | Yes |
| Use Case | Dedicated policy evaluation | All-in-one auth |

**Use Policy Agent when:**
- You need advanced Cedar or Rego policies
- You have separate authentication (handled by Auth agent or upstream)
- You want dedicated policy evaluation with caching
- You're migrating existing OPA/Cedar policies

**Use [Auth Agent](/agents/auth/) when:**
- You need authentication AND authorization
- Basic Cedar policies are sufficient
- You want a single agent for all auth concerns

## Combining with Auth Agent

For complex setups, use both agents:

```kdl
agents {
    // Auth agent handles authentication
    agent "auth" {
        transport "unix_socket" {
            path "/var/run/sentinel/auth.sock"
        }
        events ["request_headers"]
        timeout-ms 100
        failure-mode "closed"
    }

    // Policy agent handles fine-grained authorization
    agent "policy" {
        transport "unix_socket" {
            path "/var/run/sentinel/policy.sock"
        }
        events ["request_headers"]
        timeout-ms 100
        failure-mode "closed"
    }
}

routes {
    route "api" {
        matches { path-prefix "/api" }
        upstream "backend"
        // Auth runs first (authenticates), then policy (authorizes)
        agents ["auth", "policy"]
    }
}
```

The Auth agent authenticates the user and adds headers like `X-User-Id`, which the Policy agent then uses for authorization decisions.

## Related Agents

| Agent | Integration |
|-------|-------------|
| [Auth](/agents/auth/) | Authentication + basic authorization |
| [WAF](/agents/waf/) | Combine policy with attack detection |
| [Denylist](/agents/denylist/) | Block IPs before policy evaluation |

## Resources

- [GitHub Repository](https://github.com/raskell-io/sentinel-agent-policy)
- [Cedar Policy Language](https://www.cedarpolicy.com/)
- [Open Policy Agent](https://www.openpolicyagent.org/)
- [Rego Language Reference](https://www.openpolicyagent.org/docs/latest/policy-language/)
