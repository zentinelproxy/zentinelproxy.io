+++
title = "Auth"
description = "Authentication agent supporting JWT, API keys, Basic auth, and SAML SSO with session persistence."
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

The Auth agent provides authentication for your services. It supports JWT/Bearer tokens, API keys, Basic authentication, and SAML SSO with built-in session persistence.

## Features

- **JWT Validation**: Verify JWTs with HS256, RS256, ES256 algorithms
- **API Keys**: Simple header-based authentication
- **Basic Auth**: Username/password authentication (RFC 7617)
- **SAML SSO**: Enterprise single sign-on with SP-initiated flow
- **Session Persistence**: Built-in session store using embedded database
- **Claims Forwarding**: Pass validated claims/attributes to upstream services
- **Fail-Open Mode**: Graceful degradation for non-critical paths

## Installation

### Using Cargo

```bash
cargo install sentinel-agent-auth
```

### From Source

```bash
git clone https://github.com/raskell-io/sentinel-agent-auth
cd sentinel-agent-auth
cargo build --release
```

## Quick Start

### Command Line

```bash
# JWT authentication
sentinel-auth-agent \
  --socket /var/run/sentinel/auth.sock \
  --jwt-secret "your-secret-key-at-least-32-characters"

# With API keys
sentinel-auth-agent \
  --socket /var/run/sentinel/auth.sock \
  --api-keys "sk_live_abc123:production,sk_test_xyz:development"

# With Basic auth
sentinel-auth-agent \
  --socket /var/run/sentinel/auth.sock \
  --basic-auth-users "admin:secretpass,readonly:userpass"
```

### Environment Variables

```bash
export AGENT_SOCKET="/var/run/sentinel/auth.sock"
export JWT_SECRET="your-secret-key-at-least-32-characters"
export JWT_ALGORITHM="HS256"
export JWT_ISSUER="https://auth.example.com"
export API_KEYS="sk_live_abc123:production"
```

## Configuration

### Sentinel Proxy Configuration

```kdl
agents {
    agent "auth" {
        type "custom"
        transport "unix_socket" {
            path "/var/run/sentinel/auth.sock"
        }
        events ["request_headers" "request_body_chunk"]
        timeout-ms 100
        failure-mode "closed"

        config {
            // JWT configuration
            jwt-secret "your-secret-key-at-least-32-characters"
            jwt-algorithm "HS256"
            jwt-issuer "https://auth.example.com"
            jwt-audience "my-api"

            // API keys (key:name pairs)
            api-keys "sk_live_abc123:production,sk_test_xyz:staging"
            api-key-header "X-API-Key"

            // Basic auth (user:password pairs)
            basic-auth-users "admin:secret,readonly:password"

            // Headers added on successful auth
            user-id-header "X-User-Id"
            auth-method-header "X-Auth-Method"

            // Behavior
            fail-open false
        }
    }
}

routes {
    route "api" {
        matches { path-prefix "/api" }
        upstream "backend"
        agents ["auth"]
    }
}
```

### Command Line Options

| Option | Environment | Description | Default |
|--------|-------------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-auth.sock` |
| `--jwt-secret` | `JWT_SECRET` | JWT secret key (HS256) | - |
| `--jwt-public-key` | `JWT_PUBLIC_KEY` | JWT public key file (RS256/ES256) | - |
| `--jwt-algorithm` | `JWT_ALGORITHM` | Algorithm: HS256, RS256, ES256 | `HS256` |
| `--jwt-issuer` | `JWT_ISSUER` | Required issuer claim | - |
| `--jwt-audience` | `JWT_AUDIENCE` | Required audience claim | - |
| `--api-keys` | `API_KEYS` | API keys as `key:name,key:name` | - |
| `--api-key-header` | `API_KEY_HEADER` | API key header name | `X-API-Key` |
| `--basic-auth-users` | `BASIC_AUTH_USERS` | Users as `user:pass,user:pass` | - |
| `--user-id-header` | `USER_ID_HEADER` | Header for user ID | `X-User-Id` |
| `--auth-method-header` | `AUTH_METHOD_HEADER` | Header for auth method | `X-Auth-Method` |
| `--fail-open` | `FAIL_OPEN` | Allow on auth failure | `false` |

## Authentication Methods

### JWT/Bearer Token

```bash
# Configure with HS256 secret
sentinel-auth-agent --jwt-secret "your-32-char-minimum-secret-key"

# Configure with RS256 public key
sentinel-auth-agent --jwt-algorithm RS256 --jwt-public-key /path/to/public.pem

# With issuer and audience validation
sentinel-auth-agent \
  --jwt-secret "secret" \
  --jwt-issuer "https://auth.example.com" \
  --jwt-audience "my-api"
```

Client request:
```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." http://localhost:8080/api
```

### API Key

```bash
sentinel-auth-agent --api-keys "sk_live_abc123:production,sk_test_xyz:development"
```

Client request:
```bash
curl -H "X-API-Key: sk_live_abc123" http://localhost:8080/api
```

### Basic Auth

```bash
sentinel-auth-agent --basic-auth-users "admin:secretpass,user:userpass"
```

Client request:
```bash
curl -u "admin:secretpass" http://localhost:8080/api
```

## SAML SSO

The agent supports SAML 2.0 SP-initiated SSO with built-in session persistence.

### SAML Configuration

```kdl
agent "auth" {
    socket "/var/run/sentinel/auth.sock"
    events ["request_headers" "request_body_chunk"]

    config {
        saml {
            enabled true

            // Service Provider settings
            entity-id "https://app.example.com/sp"
            acs-url "https://app.example.com/saml/acs"
            acs-path "/saml/acs"

            // Identity Provider settings
            idp-sso-url "https://idp.example.com/sso"
            idp-entity-id "https://idp.example.com"

            // Session settings
            session-ttl-secs 28800  // 8 hours
            session-store-path "/var/lib/sentinel-auth/sessions.redb"

            // Cookie settings
            session-cookie-name "sentinel_saml_session"
            cookie-secure true
            cookie-http-only true
            cookie-same-site "Lax"

            // Attribute mapping (SAML attribute -> HTTP header)
            attribute-mapping {
                "email" "X-Auth-Email"
                "groups" "X-Auth-Groups"
                "department" "X-Auth-Department"
            }

            // Path protection
            protected-paths ["/app" "/api" "/admin"]
            excluded-paths ["/health" "/metrics" "/public"]
        }
    }
}
```

### SAML Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `false` | Enable SAML authentication |
| `entity-id` | string | *required* | SP entity ID |
| `acs-url` | string | *required* | Assertion Consumer Service URL |
| `acs-path` | string | `/saml/acs` | ACS path for matching |
| `idp-sso-url` | string | - | IdP SSO endpoint |
| `idp-entity-id` | string | - | IdP entity ID |
| `idp-metadata-url` | string | - | IdP metadata URL (alternative) |
| `session-ttl-secs` | int | `28800` | Session lifetime (8 hours) |
| `session-store-path` | string | `/var/lib/sentinel-auth/sessions.redb` | Session database path |
| `clock-skew-secs` | int | `300` | Clock tolerance (5 minutes) |
| `attribute-mapping` | object | `{}` | Map SAML attributes to headers |

### SAML Authentication Flow

```
1. User visits protected resource without session
2. Agent redirects to IdP with SAML AuthnRequest
3. User authenticates at IdP
4. IdP posts SAML Response to ACS endpoint
5. Agent validates assertion, creates session
6. User redirected to original URL with session cookie
7. Subsequent requests validated via session
```

### IdP Setup Examples

#### Okta

```kdl
saml {
    enabled true
    entity-id "https://app.example.com/sp"
    acs-url "https://app.example.com/saml/acs"
    idp-metadata-url "https://your-org.okta.com/app/exk.../sso/saml/metadata"
}
```

#### Azure AD

```kdl
saml {
    enabled true
    entity-id "https://app.example.com/sp"
    acs-url "https://app.example.com/saml/acs"
    idp-metadata-url "https://login.microsoftonline.com/{tenant}/federationmetadata/2007-06/federationmetadata.xml"
    attribute-mapping {
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress" "X-Auth-Email"
    }
}
```

#### Keycloak

```kdl
saml {
    enabled true
    entity-id "https://app.example.com/sp"
    acs-url "https://app.example.com/saml/acs"
    idp-metadata-url "https://keycloak.example.com/realms/myrealm/protocol/saml/descriptor"
}
```

## Session Management

SAML sessions are persisted using an embedded database (redb), allowing sessions to survive agent restarts.

### Session Features

- **Persistence**: Sessions stored in embedded database
- **Caching**: In-memory cache for hot sessions
- **Replay Prevention**: Assertion IDs tracked to prevent replay attacks
- **Background Cleanup**: Expired sessions automatically evicted

### Session Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `session-store-path` | `/var/lib/sentinel-auth/sessions.redb` | Database file path |
| `session-ttl-secs` | `28800` | Session lifetime (8 hours) |
| `cleanup-interval-secs` | `300` | Cleanup task interval (5 min) |

## Headers Added

On successful authentication, the agent adds headers to the request:

| Header | Description | Auth Methods |
|--------|-------------|--------------|
| `X-User-Id` | Authenticated user identifier | All |
| `X-Auth-Method` | Method used: `jwt`, `api_key`, `basic`, `saml` | All |
| `X-Auth-Claim-{name}` | JWT claims (flattened) | JWT |
| Custom headers | Via `attribute-mapping` | SAML |

### JWT Claims Example

```
JWT payload: {"sub": "user123", "role": "admin", "org_id": "acme"}

Headers added:
X-User-Id: user123
X-Auth-Method: jwt
X-Auth-Claim-sub: user123
X-Auth-Claim-role: admin
X-Auth-Claim-org_id: acme
```

## Response Codes

| Status | Condition |
|--------|-----------|
| 401 | Missing or invalid credentials |
| 401 | Expired token |
| 302 | SAML redirect to IdP |
| (passthrough) | Valid credentials, request forwarded |

The agent adds `WWW-Authenticate: Bearer realm="sentinel"` header on 401 responses.

## Authentication Precedence

When multiple auth methods are configured, they are checked in order:

1. **Session cookie** (SAML) - if present and valid
2. **Authorization: Bearer** (JWT) - if header present
3. **API Key header** - if configured header present
4. **Authorization: Basic** - if header present

The first successful authentication wins.

## Examples

### Multi-Method Authentication

```kdl
agent "auth" {
    socket "/var/run/sentinel/auth.sock"

    config {
        // JWT for API clients
        jwt-secret "your-secret-key"
        jwt-issuer "https://auth.example.com"

        // API keys for service-to-service
        api-keys "svc_orders:orders-service,svc_users:users-service"

        // SAML for browser users
        saml {
            enabled true
            entity-id "https://app.example.com/sp"
            acs-url "https://app.example.com/saml/acs"
            idp-sso-url "https://idp.example.com/sso"
            idp-entity-id "https://idp.example.com"
            protected-paths ["/app" "/dashboard"]
            excluded-paths ["/api"]  // API uses JWT/API keys
        }
    }
}
```

### Production Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sentinel-auth-agent
spec:
  template:
    spec:
      containers:
        - name: auth-agent
          image: ghcr.io/raskell-io/sentinel-agent-auth:latest
          env:
            - name: AGENT_SOCKET
              value: /var/run/sentinel/auth.sock
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: auth-secrets
                  key: jwt-secret
            - name: JWT_ISSUER
              value: https://auth.example.com
          volumeMounts:
            - name: socket
              mountPath: /var/run/sentinel
            - name: sessions
              mountPath: /var/lib/sentinel-auth
      volumes:
        - name: socket
          emptyDir: {}
        - name: sessions
          persistentVolumeClaim:
            claimName: auth-sessions
```

## Security Recommendations

1. **Use environment variables** for secrets, not command-line args
2. **Use RS256/ES256** for JWT in production (asymmetric keys)
3. **Set `fail-open: false`** for security-critical routes
4. **Use HTTPS** for all SAML endpoints (required by spec)
5. **Rotate secrets** regularly (JWT secrets, API keys)
6. **Limit session TTL** based on security requirements
7. **Secure session store** file permissions (0600)

## Related Agents

| Agent | Integration |
|-------|-------------|
| **WAF** | Combine auth with attack detection |
| **Denylist** | Block IPs before auth processing |

## Resources

- [GitHub Repository](https://github.com/raskell-io/sentinel-agent-auth)
- [Configuration Reference](https://github.com/raskell-io/sentinel-agent-auth/blob/main/docs/configuration.md)
- [SAML Setup Guide](https://github.com/raskell-io/sentinel-agent-auth/blob/main/docs/saml.md)
- [Session Management](https://github.com/raskell-io/sentinel-agent-auth/blob/main/docs/session-management.md)
