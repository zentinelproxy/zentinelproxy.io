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
license = "Apache-2.0"
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
- **Role-Based Access Control (RBAC)**: Path-based authorization using JWT roles/permissions
- **Scope Validation**: Enforce OAuth scopes per endpoint
- **Hierarchical Roles**: Support role inheritance (admin > manager > user)

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

### RBAC Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rbac.enabled` | boolean | `false` | Enable role-based access control |
| `rbac.roles-claim` | string | `"roles"` | JWT claim containing user roles |
| `rbac.permissions-claim` | string | `"permissions"` | JWT claim containing permissions |
| `rbac.scope-claim` | string | `"scope"` | JWT claim containing OAuth scopes |
| `rbac.role-hierarchy` | object | - | Define role inheritance |
| `rbac.default-policy` | string | `"deny"` | Default policy: `allow` or `deny` |
| `rbac.rules-file` | string | - | Path to external RBAC rules file |

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

## Role-Based Access Control (RBAC)

RBAC allows you to control access to endpoints based on user roles, permissions, or OAuth scopes from JWT claims.

### Basic RBAC Configuration

```kdl
agent "auth" {
    socket "/var/run/sentinel/auth.sock"

    config {
        jwt {
            jwks-url "https://auth.example.com/.well-known/jwks.json"
        }

        rbac {
            enabled true
            roles-claim "roles"
            default-policy deny

            // Define access rules
            rules {
                // Public endpoints - no auth required
                rule {
                    path "/health"
                    allow-anonymous true
                }
                rule {
                    path "/public/*"
                    allow-anonymous true
                }

                // Admin-only endpoints
                rule {
                    path "/admin/*"
                    roles ["admin"]
                }

                // Multiple roles allowed
                rule {
                    path "/api/users"
                    methods ["GET"]
                    roles ["admin" "manager" "user"]
                }
                rule {
                    path "/api/users"
                    methods ["POST" "PUT" "DELETE"]
                    roles ["admin" "manager"]
                }

                // Default: authenticated users
                rule {
                    path "/api/*"
                    authenticated true
                }
            }
        }
    }
}
```

### Role Hierarchy

Define role inheritance so higher-level roles automatically have lower-level permissions:

```kdl
agent "auth" {
    config {
        jwt {
            jwks-url "https://auth.example.com/.well-known/jwks.json"
        }

        rbac {
            enabled true
            roles-claim "roles"

            // admin inherits all permissions from manager and user
            // manager inherits all permissions from user
            role-hierarchy {
                "admin" ["manager" "user"]
                "manager" ["user"]
                "support" ["user"]
            }

            rules {
                rule {
                    path "/api/users/*"
                    methods ["GET"]
                    roles ["user"]  // admin, manager, support also allowed
                }
                rule {
                    path "/api/users/*"
                    methods ["PUT"]
                    roles ["manager"]  // admin also allowed
                }
                rule {
                    path "/api/users/*"
                    methods ["DELETE"]
                    roles ["admin"]  // only admin
                }
                rule {
                    path "/api/reports/*"
                    roles ["manager"]  // admin and manager
                }
                rule {
                    path "/api/tickets/*"
                    roles ["support"]  // admin and support
                }
            }
        }
    }
}
```

### Permission-Based Access

Use fine-grained permissions instead of roles:

```kdl
agent "auth" {
    config {
        jwt {
            jwks-url "https://auth.example.com/.well-known/jwks.json"
        }

        rbac {
            enabled true
            permissions-claim "permissions"

            rules {
                rule {
                    path "/api/users"
                    methods ["GET"]
                    permissions ["users:read"]
                }
                rule {
                    path "/api/users"
                    methods ["POST"]
                    permissions ["users:create"]
                }
                rule {
                    path "/api/users/*"
                    methods ["PUT"]
                    permissions ["users:update"]
                }
                rule {
                    path "/api/users/*"
                    methods ["DELETE"]
                    permissions ["users:delete"]
                }

                // Require multiple permissions
                rule {
                    path "/api/admin/users/bulk-delete"
                    methods ["POST"]
                    permissions ["users:delete" "admin:bulk-operations"]
                    require-all-permissions true
                }
            }
        }
    }
}
```

### OAuth Scope Validation

Enforce OAuth scopes for API access:

```kdl
agent "auth" {
    config {
        oauth {
            introspection-url "https://auth.example.com/oauth/introspect"
            client-id "sentinel"
            client-secret "${OAUTH_CLIENT_SECRET}"
        }

        rbac {
            enabled true
            scope-claim "scope"

            rules {
                rule {
                    path "/api/profile"
                    methods ["GET"]
                    scopes ["read:profile"]
                }
                rule {
                    path "/api/profile"
                    methods ["PUT"]
                    scopes ["write:profile"]
                }
                rule {
                    path "/api/orders"
                    methods ["GET"]
                    scopes ["read:orders"]
                }
                rule {
                    path "/api/orders"
                    methods ["POST"]
                    scopes ["write:orders"]
                }
                rule {
                    path "/api/admin/*"
                    scopes ["admin"]
                }
            }
        }
    }
}
```

### External RBAC Rules File

For complex configurations, use an external rules file:

```kdl
agent "auth" {
    config {
        jwt {
            jwks-url "https://auth.example.com/.well-known/jwks.json"
        }

        rbac {
            enabled true
            roles-claim "roles"
            rules-file "/etc/sentinel/rbac-rules.kdl"
        }
    }
}
```

**/etc/sentinel/rbac-rules.kdl:**
```kdl
// Role hierarchy
role-hierarchy {
    "super-admin" ["admin"]
    "admin" ["manager" "analyst"]
    "manager" ["user"]
    "analyst" ["user"]
}

// Public endpoints
rule {
    path "/health"
    allow-anonymous true
}
rule {
    path "/api/v1/public/*"
    allow-anonymous true
}

// User management
rule {
    path "/api/v1/users"
    methods ["GET"]
    roles ["user"]
}
rule {
    path "/api/v1/users"
    methods ["POST"]
    roles ["admin"]
}
rule {
    path "/api/v1/users/*"
    methods ["GET" "PUT"]
    roles ["manager"]
}
rule {
    path "/api/v1/users/*"
    methods ["DELETE"]
    roles ["admin"]
}

// Analytics (analyst and above)
rule {
    path "/api/v1/analytics/*"
    roles ["analyst"]
}

// Reports (manager and above)
rule {
    path "/api/v1/reports/*"
    roles ["manager"]
}

// Admin operations
rule {
    path "/api/v1/admin/*"
    roles ["admin"]
}

// Super admin only
rule {
    path "/api/v1/system/*"
    roles ["super-admin"]
}
```

### RBAC with Method-Specific Rules

Control access based on HTTP methods:

```kdl
agent "auth" {
    config {
        jwt {
            jwks-url "https://auth.example.com/.well-known/jwks.json"
        }

        rbac {
            enabled true
            roles-claim "roles"

            rules {
                // Read access for all authenticated users
                rule {
                    path "/api/v1/products/*"
                    methods ["GET" "HEAD" "OPTIONS"]
                    authenticated true
                }

                // Create/update for editors
                rule {
                    path "/api/v1/products/*"
                    methods ["POST" "PUT" "PATCH"]
                    roles ["editor" "admin"]
                }

                // Delete for admins only
                rule {
                    path "/api/v1/products/*"
                    methods ["DELETE"]
                    roles ["admin"]
                }
            }
        }
    }
}
```

### RBAC Response Headers

When RBAC is enabled, these headers are added to responses:

| Header | Description |
|--------|-------------|
| `X-Auth-User-Id` | User ID from token |
| `X-Auth-Roles` | User's roles (comma-separated) |
| `X-Auth-Permissions` | User's permissions (comma-separated) |
| `X-Auth-RBAC-Rule` | Rule that granted access |
| `X-Auth-RBAC-Denied` | Rule that denied access (on 403) |

### RBAC Denial Response

When access is denied due to insufficient permissions:

```http
HTTP/1.1 403 Forbidden
Content-Type: application/json
X-Auth-User-Id: user-123
X-Auth-Roles: user
X-Auth-RBAC-Denied: /api/admin/* requires roles: [admin]

{
    "error": "forbidden",
    "message": "Insufficient permissions",
    "required_roles": ["admin"],
    "user_roles": ["user"],
    "path": "/api/admin/settings"
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

## Related Agents

| Agent | Integration |
|-------|-------------|
| **WAF** | Combine auth with attack detection |
| **AI Gateway** | Auth for AI API endpoints |
| **Denylist** | Block IPs before auth processing |

> **Note:** For rate limiting authenticated users, use [Sentinel's built-in rate limiting](/configuration/limits/) with `key api-key` or `key user`.
