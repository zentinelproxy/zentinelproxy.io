+++
title = "Auth"
description = "Authentication and authorization agent supporting JWT, OIDC, API keys, Basic auth, SAML SSO, mTLS, Cedar policies, and token exchange."
template = "agent.html"

[taxonomies]
tags = ["security", "auth", "core", "authorization", "oidc", "mtls"]

[extra]
official = true
author = "Sentinel Core Team"
author_url = "https://github.com/raskell-io"
status = "Stable"
version = "0.2.0"
license = "Apache-2.0"
repo = "https://github.com/raskell-io/sentinel-agent-auth"
homepage = "https://sentinel.raskell.io/agents/auth/"
protocol_version = "v2"

# Installation methods
crate_name = "sentinel-agent-auth"
docker_image = ""

# Compatibility
min_sentinel_version = "26.01.0"
+++

## Overview

The Auth agent provides comprehensive authentication and authorization for your services. It supports multiple authentication methods including JWT, OIDC/OAuth 2.0, API keys, Basic auth, SAML SSO, and mTLS client certificates. Authorization is powered by the Cedar policy engine for fine-grained access control.

## Features

### Authentication (AuthN)
- **JWT Validation**: Verify JWTs with HS256, RS256, ES256 algorithms
- **OIDC/OAuth 2.0**: OpenID Connect with automatic JWKS key rotation
- **API Keys**: Simple header-based authentication
- **Basic Auth**: Username/password authentication (RFC 7617)
- **SAML SSO**: Enterprise single sign-on with SP-initiated flow
- **mTLS Client Certificates**: X.509 certificate-based authentication

### Authorization (AuthZ)
- **Cedar Policy Engine**: Fine-grained, policy-as-code authorization

### Token Services
- **Token Exchange (RFC 8693)**: Convert between token types (SAML→JWT, external→internal)

### General
- **Session Persistence**: Built-in session store using embedded database
- **Claims Forwarding**: Pass validated claims/attributes to upstream services
- **Fail-Open Mode**: Graceful degradation for non-critical paths

### Protocol v2
- **gRPC Transport**: High-performance gRPC transport for production deployments
- **Health Reporting**: Automatic health status reporting to proxy
- **Metrics Export**: Built-in metrics (auth success/failure rates, request counts)
- **Capability Negotiation**: Dynamic feature discovery during handshake
- **Graceful Lifecycle**: Proper drain and shutdown handling

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
# UDS transport (default)
sentinel-auth-agent \
  --socket /var/run/sentinel/auth.sock \
  --jwt-secret "your-secret-key-at-least-32-characters"

# gRPC transport (v2 protocol)
sentinel-auth-agent \
  --grpc-address "[::1]:50051" \
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
    // UDS transport
    agent "auth" {
        type "custom"
        transport "unix_socket" {
            path "/var/run/sentinel/auth.sock"
        }
        events ["request_headers" "request_body_chunk"]
        timeout-ms 100
        failure-mode "closed"
        protocol-version 2

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

#### gRPC Transport (v2)

```kdl
agents {
    agent "auth" {
        type "custom"
        transport "grpc" {
            address "127.0.0.1:50051"
        }
        events ["request_headers" "request_body_chunk"]
        timeout-ms 100
        failure-mode "closed"
        protocol-version 2
    }
}
```

### Command Line Options

| Option | Environment | Description | Default |
|--------|-------------|-------------|---------|
| `--socket` | `AGENT_SOCKET` | Unix socket path | `/tmp/sentinel-auth.sock` |
| `--grpc-address` | `GRPC_ADDRESS` | gRPC listen address (v2 protocol) | - |
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

### OIDC/OAuth 2.0

OIDC authentication with automatic JWKS key fetching and rotation:

```kdl
config {
    oidc {
        enabled true
        issuer "https://auth.example.com"
        jwks-url "https://auth.example.com/.well-known/jwks.json"
        audience "my-api"
        required-scopes ["read" "write"]
        jwks-refresh-secs 3600
    }
}
```

Client request:
```bash
curl -H "Authorization: Bearer <oauth2-access-token>" http://localhost:8080/api
```

#### OIDC Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `false` | Enable OIDC authentication |
| `issuer` | string | *required* | Expected token issuer |
| `jwks-url` | string | *required* | URL to fetch JWKS |
| `audience` | string | - | Expected audience claim |
| `required-scopes` | array | `[]` | Scopes that must be present |
| `jwks-refresh-secs` | int | `3600` | JWKS cache refresh interval |
| `clock-skew-secs` | int | `30` | Clock tolerance |

#### OIDC Provider Examples

**Auth0:**
```kdl
oidc {
    enabled true
    issuer "https://your-tenant.auth0.com/"
    jwks-url "https://your-tenant.auth0.com/.well-known/jwks.json"
    audience "https://your-api.example.com"
}
```

**Okta:**
```kdl
oidc {
    enabled true
    issuer "https://your-org.okta.com/oauth2/default"
    jwks-url "https://your-org.okta.com/oauth2/default/v1/keys"
    audience "api://your-api"
}
```

**Azure AD:**
```kdl
oidc {
    enabled true
    issuer "https://login.microsoftonline.com/{tenant-id}/v2.0"
    jwks-url "https://login.microsoftonline.com/{tenant-id}/discovery/v2.0/keys"
    audience "api://{client-id}"
}
```

### mTLS Client Certificates

Authenticate services using X.509 client certificates. The Sentinel proxy terminates TLS and forwards the certificate:

```kdl
config {
    mtls {
        enabled true
        client-cert-header "X-Client-Cert"
        allowed-dns ["CN=api-gateway,O=Example Corp" "CN=backend-service,O=Example Corp"]
        allowed-sans ["service@example.com"]
        extract-cn-as-user true
    }
}
```

#### Sentinel Proxy mTLS Configuration

```kdl
listener {
    tls {
        client-auth "require"
        forward-client-cert-header "X-Client-Cert"
        ca-cert-file "/etc/ssl/ca.crt"
    }
}
```

#### mTLS Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `false` | Enable mTLS authentication |
| `client-cert-header` | string | `X-Client-Cert` | Header with client certificate |
| `ca-cert-path` | string | - | CA cert for chain validation |
| `allowed-dns` | array | `[]` | Allowed Distinguished Names |
| `allowed-sans` | array | `[]` | Allowed Subject Alternative Names |
| `extract-cn-as-user` | bool | `true` | Use CN as user ID |
| `extract-san-email-as-user` | bool | `false` | Use SAN email as user ID |

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

## Authorization (Cedar Policy Engine)

After authentication, the Cedar policy engine evaluates whether the request is authorized.

### Authorization Configuration

```kdl
config {
    authz {
        enabled true
        policy-file "/etc/sentinel/policies/auth.cedar"
        default-decision "deny"
        principal-claim "sub"
        roles-claim "roles"
    }
}
```

### Authorization Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `false` | Enable authorization |
| `policy-file` | string | - | Path to Cedar policy file |
| `policy-inline` | string | - | Inline Cedar policy text |
| `default-decision` | string | `deny` | Decision when no policy matches |
| `principal-claim` | string | `sub` | JWT claim for principal ID |
| `roles-claim` | string | - | JWT claim containing roles |

### Cedar Policy Example

```cedar
// Allow authenticated users to read public API
permit(
    principal,
    action == Action::"GET",
    resource
) when {
    resource.path like "/api/public/*"
};

// Allow admins full access
permit(
    principal,
    action,
    resource
) when {
    context.roles.contains("admin")
};

// Users can only access their own resources
permit(
    principal,
    action,
    resource
) when {
    resource.path like "/api/users/*" &&
    resource.path.endsWith(principal.id)
};

// Deny access to admin endpoints for non-admins
forbid(
    principal,
    action,
    resource
) when {
    resource.path like "/admin/*" &&
    !context.roles.contains("admin")
};
```

### Cedar Request Context

The agent builds Cedar requests with:

| Entity | Source | Example |
|--------|--------|---------|
| Principal | User ID | `User::"john@example.com"` |
| Action | HTTP method | `Action::"GET"` |
| Resource | Request path | `Resource::"/api/users/123"` |
| Context | Claims, roles | `{"roles": ["admin"], "claims": {...}}` |

## Token Exchange (RFC 8693)

Exchange one token type for another (e.g., SAML assertion → JWT).

### Token Exchange Configuration

```kdl
config {
    token-exchange {
        enabled true
        endpoint-path "/token/exchange"
        issuer "https://auth.internal.example.com"
        signing-key-file "/etc/sentinel/jwt-private.pem"
        signing-algorithm "RS256"
        token-ttl-secs 3600
        allowed-exchanges [
            { subject-token-type "saml2" issued-token-type "access_token" }
            { subject-token-type "jwt" issued-token-type "access_token" }
        ]
    }
}
```

### Token Exchange Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | bool | `false` | Enable token exchange |
| `endpoint-path` | string | `/token/exchange` | Exchange endpoint path |
| `issuer` | string | *required* | Issuer for new tokens |
| `signing-key-file` | string | *required* | Path to signing key |
| `signing-algorithm` | string | `RS256` | Algorithm: RS256, ES256, HS256 |
| `token-ttl-secs` | int | `3600` | Token lifetime |
| `allowed-exchanges` | array | `[]` | Allowed conversions |

### Token Exchange Request

```bash
curl -X POST http://localhost:8080/token/exchange \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=<saml_assertion_or_jwt>" \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:saml2" \
  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "audience=my-api"
```

### Token Exchange Response

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

## Headers Added

On successful authentication, the agent adds headers to the request:

| Header | Description | Auth Methods |
|--------|-------------|--------------|
| `X-User-Id` | Authenticated user identifier | All |
| `X-Auth-Method` | Method used: `jwt`, `oidc`, `mtls`, `api_key`, `basic`, `saml` | All |
| `X-Auth-Claim-{name}` | Token claims (flattened) | JWT, OIDC |
| `X-Client-Cert-CN` | Certificate Common Name | mTLS |
| `X-Client-Cert-DN` | Certificate Distinguished Name | mTLS |
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
| 403 | Authorization denied (Cedar policy) |
| 302 | SAML redirect to IdP |
| (passthrough) | Valid credentials and authorized, request forwarded |

The agent adds `WWW-Authenticate: Bearer realm="sentinel"` header on 401 responses.

## Authentication Precedence

When multiple auth methods are configured, they are checked in order:

1. **mTLS Client Certificate** - if `X-Client-Cert` header present
2. **Session cookie** (SAML) - if present and valid
3. **Authorization: Bearer** (OIDC) - if OIDC configured and header present
4. **Authorization: Bearer** (JWT) - if JWT configured and header present
5. **API Key header** - if configured header present
6. **Authorization: Basic** - if header present

The first successful authentication wins. After authentication, if authorization is enabled, the Cedar policy engine evaluates the request.

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
4. **Use HTTPS** for all SAML and OIDC endpoints (required by spec)
5. **Rotate secrets** regularly (JWT secrets, API keys, signing keys)
6. **Limit session TTL** based on security requirements
7. **Secure session store** file permissions (0600)
8. **Use default deny** for Cedar authorization policies
9. **Validate JWKS sources** - only configure trusted issuer URLs
10. **Use CA validation** for mTLS when possible
11. **Rate limit token exchange** endpoint to prevent abuse

## Related Agents

| Agent | Integration |
|-------|-------------|
| **WAF** | Combine auth with attack detection |
| **Denylist** | Block IPs before auth processing |

## Resources

- [GitHub Repository](https://github.com/raskell-io/sentinel-agent-auth)
- [Configuration Reference](https://github.com/raskell-io/sentinel-agent-auth/blob/main/docs/configuration.md)
- [SAML Setup Guide](https://github.com/raskell-io/sentinel-agent-auth/blob/main/docs/saml.md)
- [OIDC Authentication](https://github.com/raskell-io/sentinel-agent-auth/blob/main/docs/oidc.md)
- [mTLS Authentication](https://github.com/raskell-io/sentinel-agent-auth/blob/main/docs/mtls.md)
- [Authorization (Cedar)](https://github.com/raskell-io/sentinel-agent-auth/blob/main/docs/authorization.md)
- [Token Exchange](https://github.com/raskell-io/sentinel-agent-auth/blob/main/docs/token-exchange.md)
- [Session Management](https://github.com/raskell-io/sentinel-agent-auth/blob/main/docs/session-management.md)
