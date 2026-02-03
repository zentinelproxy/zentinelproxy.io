+++
title = "GraphQL Security"
weight = 140
description = "GraphQL-specific security controls including query depth limiting, complexity analysis, introspection control, and field-level authorization."
template = "agent.html"

[taxonomies]
tags = ["security", "graphql", "api"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-graphql-security"
homepage = "https://sentinel.raskell.io/agents/graphql-security/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-graphql-security"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Protocol v2 Features

As of v0.2.0, the GraphQL Security agent supports protocol v2 with:

- **Capability negotiation**: Reports supported features during handshake
- **Health reporting**: Exposes health status for monitoring
- **Metrics export**: Counter metrics for requests and blocks
- **gRPC transport**: Optional high-performance gRPC transport via `--grpc-address`
- **Lifecycle hooks**: Graceful shutdown and drain handling

## Overview

A comprehensive GraphQL security agent for Sentinel that protects GraphQL APIs from common attacks and abuse patterns. Uses [Apollo Parser](https://crates.io/crates/apollo-parser) for spec-compliant GraphQL parsing.

GraphQL's flexibility makes it powerful but also introduces unique security challenges—deeply nested queries, expensive operations, and schema exposure can lead to denial-of-service, data leakage, and abuse. This agent provides defense-in-depth controls specifically designed for GraphQL.

## Features

- **Query Depth Limiting**: Prevent deeply nested queries that can cause exponential backend load
- **Complexity Analysis**: Calculate query cost based on field weights and list multipliers
- **Alias Limiting**: Block alias-based attacks that duplicate expensive operations
- **Batch Query Limiting**: Limit operations per request in batch queries
- **Introspection Control**: Block schema introspection in production with client allowlists
- **Field Authorization**: Role and scope-based access control with glob patterns
- **Persisted Queries**: Allowlist mode and APQ (Automatic Persisted Queries) support
- **GraphQL-Compliant Errors**: Returns proper GraphQL error responses (HTTP 200)

## Installation

### Using Bundle (Recommended)

The easiest way to install this agent is via the Sentinel bundle command:

```bash
# Install just this agent
sentinel bundle install graphql-security

# Or install all available agents
sentinel bundle install --all
```

The bundle command automatically downloads the correct binary for your platform and places it in `~/.sentinel/agents/`.

### Using Cargo

```bash
cargo install sentinel-agent-graphql-security
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-graphql-security
cd sentinel-agent-graphql-security
cargo build --release
```

## Configuration

### Command Line

```bash
sentinel-agent-graphql-security --config config.yaml --socket /var/run/sentinel/graphql.sock
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--config`, `-c` | Path to YAML configuration file | `config.yaml` |
| `--socket`, `-s` | Unix socket path | `/tmp/sentinel-graphql-security.sock` |
| `--grpc-address` | gRPC listen address (e.g., `0.0.0.0:50051`) | - |
| `--log-level`, `-l` | Log level (trace, debug, info, warn, error) | `info` |

### Configuration File (YAML)

```yaml
version: "1"

settings:
  max_body_size: 1048576  # 1MB
  debug_headers: false
  fail_action: block  # or "allow" for detect-only mode

depth:
  enabled: true
  max_depth: 10
  ignore_introspection: true

complexity:
  enabled: true
  max_complexity: 1000
  default_field_cost: 1
  default_list_multiplier: 10
  field_costs:
    Query.users: 10
    Query.orders: 15
  list_size_arguments:
    - first
    - last
    - limit
    - pageSize

aliases:
  enabled: true
  max_aliases: 10
  max_duplicate_aliases: 3

batch:
  enabled: true
  max_queries: 5

introspection:
  enabled: true
  allow: false
  allowed_clients:
    - "127.0.0.1"
    - "introspection-key-abc123"
  allowed_clients_header: "X-Introspection-Key"
  allow_typename: true  # Needed for Apollo Client

field_auth:
  enabled: true
  rules:
    - fields:
        - "Query.admin*"
        - "Mutation.delete*"
      require_roles:
        - admin
      roles_header: "X-User-Roles"
    - fields:
        - "User.email"
        - "User.phone"
      require_scopes:
        - "read:pii"
      scopes_header: "X-User-Scopes"

persisted_queries:
  enabled: false
  mode: allowlist  # or "cache"
  allowlist_file: "/etc/sentinel/graphql-allowlist.json"
  require_hash: false
```

### Sentinel Configuration

```kdl
agent "graphql-security" {
    socket "/var/run/sentinel/graphql.sock"
    timeout 100ms
    events ["request_headers" "request_body"]
}

route {
    match { path "/graphql" }
    agents ["graphql-security"]
    upstream "graphql-backend"
}
```

## Query Depth Limiting

Prevents deeply nested queries that can cause exponential load on resolvers.

```graphql
# This query has depth 7 - would be blocked with max_depth: 5
{
  users {
    posts {
      comments {
        author {
          posts {
            comments {
              text
            }
          }
        }
      }
    }
  }
}
```

**Configuration:**

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Enable depth limiting | `true` |
| `max_depth` | Maximum nesting depth | `10` |
| `ignore_introspection` | Don't count `__schema`/`__type` in depth | `true` |

## Complexity Analysis

Calculates query cost based on field weights and list multipliers to prevent expensive operations.

**Cost calculation:**
- Each field has a base cost (default: 1)
- List fields multiply nested costs by the list size argument
- Total cost = sum of all field costs with multipliers

```graphql
# Cost: users(1) + posts(1*10) + title(1*10) = 21
{
  users(first: 10) {
    posts(first: 10) {
      title
    }
  }
}
```

**Configuration:**

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Enable complexity analysis | `true` |
| `max_complexity` | Maximum allowed complexity | `1000` |
| `default_field_cost` | Default cost per field | `1` |
| `default_list_multiplier` | Default multiplier for lists | `10` |
| `field_costs` | Custom costs per field (e.g., `Query.users: 10`) | `{}` |
| `list_size_arguments` | Arguments indicating list size | `[first, last, limit, pageSize]` |

## Alias Limiting

Prevents alias-based attacks where attackers duplicate expensive fields:

```graphql
# Alias attack - same expensive query 100 times
{
  a1: expensiveQuery { ... }
  a2: expensiveQuery { ... }
  # ... 98 more
}
```

**Configuration:**

| Option | Description | Default |
|--------|-------------|---------|
| `enabled` | Enable alias limiting | `true` |
| `max_aliases` | Maximum total aliases per query | `10` |
| `max_duplicate_aliases` | Max times same field can be aliased | `3` |

## Introspection Control

Block schema introspection in production while allowing specific clients:

```yaml
introspection:
  enabled: true
  allow: false  # Block by default
  allowed_clients:
    - "192.168.1.0/24"  # Allow from internal network
    - "dev-key-12345"   # Allow with specific key
  allowed_clients_header: "X-Introspection-Key"
  allow_typename: true  # Apollo Client needs __typename
```

**Blocked queries:**
- `{ __schema { types { name } } }`
- `{ __type(name: "User") { fields { name } } }`

**Allowed (with `allow_typename: true`):**
- `{ users { __typename id } }`

## Field-Level Authorization

Restrict access to fields based on roles or scopes from request headers:

```yaml
field_auth:
  enabled: true
  rules:
    - fields:
        - "Query.admin*"      # Glob pattern
        - "Mutation.delete*"
      require_roles:
        - admin
        - superuser
      roles_header: "X-User-Roles"  # Expects: "admin, user, viewer"

    - fields:
        - "User.email"
        - "User.ssn"
      require_scopes:
        - "read:pii"
      scopes_header: "X-User-Scopes"  # Expects: "read:profile, read:pii"
```

Headers should contain comma-separated values:
```
X-User-Roles: admin, user
X-User-Scopes: read:profile, read:pii, write:posts
```

## Persisted Queries

Restrict queries to a pre-approved allowlist:

**Allowlist file format (`graphql-allowlist.json`):**

```json
{
  "version": 1,
  "queries": [
    {
      "hash": "abc123def456...",
      "name": "GetCurrentUser"
    },
    {
      "hash": "789xyz...",
      "name": "ListProducts"
    }
  ]
}
```

**APQ (Automatic Persisted Queries) support:**

Clients can send queries with the standard APQ extension:

```json
{
  "query": "{ users { id } }",
  "extensions": {
    "persistedQuery": {
      "version": 1,
      "sha256Hash": "abc123..."
    }
  }
}
```

## Response Headers (Debug Mode)

When `debug_headers: true`:

| Header | Description |
|--------|-------------|
| `X-GraphQL-Depth` | Calculated query depth |
| `X-GraphQL-Complexity` | Calculated query complexity |
| `X-GraphQL-Aliases` | Number of aliases in query |
| `X-GraphQL-Operations` | Number of operations (batch) |
| `X-GraphQL-Fields` | Total fields in query |

## Error Responses

Errors are returned as GraphQL-compliant responses (HTTP 200):

```json
{
  "errors": [
    {
      "message": "Query depth of 15 exceeds maximum allowed depth of 10",
      "extensions": {
        "code": "DEPTH_EXCEEDED",
        "sentinel": true,
        "actual": 15,
        "max": 10
      }
    }
  ]
}
```

**Error codes:**
- `DEPTH_EXCEEDED` - Query too deeply nested
- `COMPLEXITY_EXCEEDED` - Query too expensive
- `TOO_MANY_ALIASES` - Too many aliases
- `TOO_MANY_BATCH_QUERIES` - Batch too large
- `INTROSPECTION_BLOCKED` - Introspection not allowed
- `FIELD_UNAUTHORIZED` - Field access denied
- `QUERY_NOT_ALLOWED` - Query not in allowlist
- `PARSE_ERROR` - Invalid GraphQL syntax
- `INVALID_REQUEST` - Malformed request

## Detect-Only Mode

Monitor without blocking by setting `fail_action: allow`:

```yaml
settings:
  fail_action: allow  # Log violations but don't block
  debug_headers: true  # Add metrics headers
```

## Related Agents

| Agent | Integration |
|-------|-------------|
| **[Auth](/agents/auth/)** | Authenticate requests before GraphQL processing |
| **[Rate Limit](/agents/ratelimit/)** | Rate limit by client, operation, or field |
| **[WAF](/agents/waf/)** | Additional injection protection |

## Resources

- [GitHub Repository](https://github.com/raskell-io/sentinel-agent-graphql-security)
- [Apollo Parser](https://crates.io/crates/apollo-parser)
- [GraphQL Security Best Practices](https://graphql.org/learn/security/)
- [OWASP GraphQL Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html)
