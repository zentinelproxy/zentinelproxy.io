+++
title = "Auth"
description = "Authentication and authorization agent supporting JWT, API keys, OAuth, and custom auth providers."
template = "agent.html"

[taxonomies]
tags = ["security", "auth", "core"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.1.0"
license = "MIT"
repo = "https://github.com/raskell-io/sentinel-agent-auth"
homepage = "https://sentinel.raskell.io/agents/auth/"
protocol_version = "0.1"

# Installation methods
crate_name = "sentinel-agent-auth"
docker_image = ""

# Compatibility
min_sentinel_version = "25.12.0"
+++

## Overview

The Auth agent provides comprehensive authentication and authorization for your services. Support for JWT validation, API key authentication, OAuth token introspection, and custom auth providers.

## Features

- **JWT Validation**: Verify JWTs with RS256, ES256, HS256 algorithms
- **JWKS Support**: Automatic key rotation via JWKS endpoints
- **API Keys**: Simple API key authentication from headers or query params
- **Claims Forwarding**: Pass validated claims to upstream services
- **Role-Based Access**: Authorize based on JWT claims or custom logic

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-auth
```

### Using Docker

```bash
docker pull ghcr.io/raskell-io/sentinel-agent-auth:latest
```

### Docker Compose

```yaml
services:
  auth-agent:
    image: ghcr.io/raskell-io/sentinel-agent-auth:latest
    volumes:
      - /var/run/sentinel:/var/run/sentinel
    environment:
      - SOCKET_PATH=/var/run/sentinel/auth.sock
      - JWKS_URL=https://auth.example.com/.well-known/jwks.json
```

## Configuration

Add the agent to your Sentinel configuration:

```kdl
agent "auth" {
    socket "/var/run/sentinel/auth.sock"
    timeout 100ms
    fail-open false

    config {
        // JWT configuration
        jwt {
            header "Authorization"
            prefix "Bearer "
            algorithms ["RS256" "ES256"]
            jwks-url "https://auth.example.com/.well-known/jwks.json"
            jwks-cache-ttl 3600

            validation {
                issuer "https://auth.example.com"
                audience ["api.example.com"]
                require-exp true
            }

            forward-claims {
                "sub" "X-User-Id"
                "email" "X-User-Email"
                "roles" "X-User-Roles"
            }
        }
    }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `jwt.header` | string | `"Authorization"` | Header containing the token |
| `jwt.prefix` | string | `"Bearer "` | Token prefix to strip |
| `jwt.algorithms` | array | `["RS256"]` | Allowed signing algorithms |
| `jwt.jwks-url` | string | - | JWKS endpoint URL |
| `jwt.jwks-cache-ttl` | integer | `3600` | JWKS cache duration in seconds |

## Authentication Methods

### JWT Authentication

```kdl
agent "auth" {
    config {
        jwt {
            jwks-url "https://auth.example.com/.well-known/jwks.json"
            validation {
                issuer "https://auth.example.com"
            }
        }
    }
}
```

### API Key Authentication

```kdl
agent "auth" {
    config {
        api-key {
            header "X-API-Key"
            keys-file "/etc/sentinel/api-keys.json"
            hash-algorithm "sha256"
        }
    }
}
```

### OAuth Token Introspection

```kdl
agent "auth" {
    config {
        oauth {
            introspection-url "https://auth.example.com/oauth/introspect"
            client-id "sentinel"
            client-secret "${OAUTH_CLIENT_SECRET}"
            cache-ttl 300
        }
    }
}
```

## Response Codes

| Status | Condition |
|--------|-----------|
| 401 | Missing or malformed token |
| 401 | Invalid signature |
| 401 | Expired token |
| 403 | Insufficient permissions |

## Test Payloads

### Valid JWT Request

```bash
curl -i http://localhost:8080/api/protected \
  -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Missing Token

```bash
curl -i http://localhost:8080/api/protected
```

### Expected Response (Unauthorized)

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="api"
Content-Type: application/json

{"error": "unauthorized", "message": "Missing or invalid authentication token"}
```

## Examples

### Multi-Tenant API

```kdl
agent "auth" {
    socket "/var/run/sentinel/auth.sock"

    config {
        jwt {
            jwks-url "https://auth.example.com/.well-known/jwks.json"

            validation {
                issuer "https://auth.example.com"
                require-claims ["tenant_id" "user_id"]
            }

            forward-claims {
                "tenant_id" "X-Tenant-Id"
                "user_id" "X-User-Id"
                "permissions" "X-Permissions"
            }
        }

        // Public endpoints that skip auth
        skip-paths [
            "/health"
            "/public/*"
            "/.well-known/*"
        ]
    }
}
```

### API Key with Rate Limit Tiers

```kdl
agent "auth" {
    config {
        api-key {
            header "X-API-Key"
            keys-file "/etc/sentinel/api-keys.json"

            // Forward tier info for rate limiting
            forward-metadata {
                "tier" "X-API-Tier"
                "org_id" "X-Org-Id"
            }
        }
    }
}
```
